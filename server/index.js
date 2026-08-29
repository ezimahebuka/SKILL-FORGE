import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { parse } from "csv-parse/sync";
import mongoose from "mongoose";
import { User, ApprovedEmail, Quiz, Question, Attempt } from "./models.js";

const app = express();
app.use(
  cors({
    origin:
      process.env.CLIENT_URL ||
      "http://localhost:5173" ||
      "https://the-skill-forge.vercel.app/",
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
const sign = (user) =>
  jwt.sign(
    { id: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );
const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
const publicUser = (user) => ({
  id: user._id,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
});

function auth(req, res, next) {
  try {
    req.user = jwt.verify(req.cookies.quiz_token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Authentication required." });
  }
}
function admin(req, res, next) {
  if (req.user.role !== "admin")
    return res.status(403).json({ message: "Administrator access required." });
  next();
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const { fullName, email, password, confirmPassword } = req.body;
    if (
      !fullName ||
      !email ||
      !password ||
      password !== confirmPassword ||
      password.length < 8
    )
      return res.status(400).json({
        message:
          "Enter a name and a password of at least 8 characters. Passwords must match.",
      });
    const cleanEmail = normalize(email);
    if (!(await ApprovedEmail.exists({ email: cleanEmail })))
      return res.status(403).json({
        message:
          "Your email is not registered for this quiz. Please contact the administrator.",
      });
    if (await User.exists({ email: cleanEmail }))
      return res
        .status(409)
        .json({ message: "An account already exists for this email." });
    const user = await User.create({
      fullName: fullName.trim(),
      email: cleanEmail,
      passwordHash: await bcrypt.hash(password, 12),
      isApproved: true,
    });
    res.status(201).json({ user: publicUser(user) });
  } catch {
    res
      .status(500)
      .json({ message: "Unable to create your account right now." });
  }
});
app.post("/api/auth/login", async (req, res) => {
  const user = await User.findOne({ email: normalize(req.body.email) });
  if (
    !user ||
    !(await bcrypt.compare(req.body.password || "", user.passwordHash))
  )
    return res.status(401).json({ message: "Incorrect email or password." });
  if (user.isDisabled || !user.isApproved)
    return res
      .status(403)
      .json({ message: "This account is not currently available." });
  res.cookie("quiz_token", sign(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 604800000,
  });
  res.json({ user: publicUser(user) });
});
app.post("/api/auth/logout", (_, res) => {
  res.clearCookie("quiz_token");
  res.status(204).end();
});
app.get("/api/auth/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    res.clearCookie("quiz_token");
    return res
      .status(401)
      .json({ message: "Session expired. Please sign in again." });
  }
  res.json({ user: publicUser(user) });
});

app.get("/api/quizzes", auth, async (_, res) =>
  res.json({ quizzes: await Quiz.find({ isActive: true }).lean() }),
);
app.get("/api/quizzes/:id", auth, async (req, res) => {
  const quiz = await Quiz.findOne({
    _id: req.params.id,
    isActive: true,
  }).lean();
  if (!quiz) return res.status(404).json({ message: "Quiz not found." });
  const questionCount = await Question.countDocuments({ quizId: quiz._id });
  res.json({ quiz: { ...quiz, questionCount } });
});
app.post("/api/quizzes/:id/start", auth, async (req, res) => {
  const quiz = await Quiz.findOne({ _id: req.params.id, isActive: true });
  if (!quiz) return res.status(404).json({ message: "Quiz not found." });
  const questionCount = await Question.countDocuments({ quizId: quiz._id });
  let existing = await Attempt.findOne({
    userId: req.user.id,
    quizId: quiz._id,
    status: "in_progress",
  });
  if (
    existing &&
    Date.now() - existing.startedAt.getTime() > questionCount * 60000 + 120000
  ) {
    await existing.deleteOne();
    existing = null;
  }
  const attempt =
    existing ||
    (await Attempt.create({
      userId: req.user.id,
      quizId: quiz._id,
      startedAt: new Date(),
    }));
  const questions = await Question.find({ quizId: quiz._id })
    .select("-correctAnswer")
    .lean();
  res.json({ attemptId: attempt._id, quiz, questions });
});
app.post("/api/quizzes/:id/submit", auth, async (req, res) => {
  const attempt = await Attempt.findOne({
    _id: req.body.attemptId,
    userId: req.user.id,
    quizId: req.params.id,
    status: "in_progress",
  });
  if (!attempt)
    return res
      .status(409)
      .json({ message: "This quiz attempt is no longer active." });
  const questions = await Question.find({ quizId: req.params.id }).lean();
  if (
    Date.now() - attempt.startedAt.getTime() >
    questions.length * 60000 + 120000
  )
    return res.status(400).json({ message: "This quiz attempt has expired." });
  const submitted = new Map(
    (Array.isArray(req.body.answers) ? req.body.answers : []).map((item) => [
      String(item.questionId),
      item.answer,
    ]),
  );
  const answers = questions.map((question) => {
    const answer = submitted.get(String(question._id)) ?? "";
    return {
      questionId: question._id,
      answer,
      isCorrect:
        Boolean(answer) &&
        normalize(answer) === normalize(question.correctAnswer),
    };
  });
  const correctAnswers = answers.filter((item) => item.isCorrect).length;
  const unanswered = answers.filter(
    (item) => !String(item.answer).trim(),
  ).length;
  const completion = {
    answers,
    totalQuestions: questions.length,
    correctAnswers,
    unanswered,
    incorrectAnswers: questions.length - correctAnswers - unanswered,
    score: correctAnswers,
    percentage: questions.length
      ? Math.round((correctAnswers / questions.length) * 100)
      : 0,
    completedAt: new Date(),
    status: "completed",
  };
  const completedAttempt = await Attempt.findOneAndUpdate(
    { _id: attempt._id, status: "in_progress" },
    { $set: completion },
    { new: true },
  );
  if (!completedAttempt)
    return res
      .status(409)
      .json({ message: "This quiz attempt is no longer active." });
  sendResultEmail(req.user.id, completedAttempt).catch((error) =>
    console.error("Quiz result email failed:", error.message),
  );
  res.json({ attemptId: attempt._id });
});
app.get("/api/results/:id", auth, async (req, res) => {
  const attempt = await Attempt.findOne({
    _id: req.params.id,
    userId: req.user.id,
    status: "completed",
  })
    .populate("quizId", "title")
    .lean();
  if (!attempt) return res.status(404).json({ message: "Result not found." });
  const questions = await Question.find({
    _id: { $in: attempt.answers.map((answer) => answer.questionId) },
  }).lean();
  const byId = new Map(
    questions.map((question) => [String(question._id), question]),
  );
  res.json({
    result: {
      ...attempt,
      quiz: attempt.quizId,
      answers: attempt.answers.map((answer) => ({
        ...answer,
        question: byId.get(String(answer.questionId)),
      })),
    },
  });
});

app.get("/api/admin/stats", auth, admin, async (_, res) => {
  const [users, attempts, questions, scores] = await Promise.all([
    User.countDocuments(),
    Attempt.countDocuments({ status: "completed" }),
    Question.countDocuments(),
    Attempt.aggregate([
      { $match: { status: "completed" } },
      {
        $group: {
          _id: null,
          average: { $avg: "$percentage" },
          highest: { $max: "$percentage" },
        },
      },
    ]),
  ]);
  res.json({
    stats: {
      users,
      attempts,
      questions,
      average: Math.round(scores[0]?.average || 0),
      highest: scores[0]?.highest || 0,
    },
  });
});
app.get("/api/admin/users", auth, admin, async (_, res) =>
  res.json({
    users: await User.find().select("-passwordHash").sort("-createdAt").lean(),
  }),
);
app.patch("/api/admin/users/:id", auth, admin, async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    {
      isApproved: Boolean(req.body.isApproved),
      isDisabled: Boolean(req.body.isDisabled),
    },
    { new: true },
  ).select("-passwordHash");
  res.json({ user });
});
app.delete("/api/admin/users/:id", auth, admin, async (req, res) => {
  if (req.params.id === req.user.id)
    return res
      .status(400)
      .json({ message: "You cannot delete your own admin account." });
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found." });
  if (
    user.role === "admin" &&
    (await User.countDocuments({ role: "admin" })) <= 1
  )
    return res
      .status(400)
      .json({ message: "The final admin account cannot be deleted." });
  await Attempt.deleteMany({ userId: user._id });
  await user.deleteOne();
  res.status(204).end();
});
app.get("/api/admin/results", auth, admin, async (_, res) =>
  res.json({
    results: await Attempt.find({ status: "completed" })
      .populate("userId", "fullName email")
      .populate("quizId", "title")
      .sort("-completedAt")
      .lean(),
  }),
);
app.delete("/api/admin/results/:id", auth, admin, async (req, res) => {
  const result = await Attempt.findOneAndDelete({
    _id: req.params.id,
    status: "completed",
  });
  if (!result) return res.status(404).json({ message: "Result not found." });
  res.status(204).end();
});
app.get("/api/admin/quizzes", auth, admin, async (_, res) =>
  res.json({ quizzes: await Quiz.find().sort("-createdAt").lean() }),
);
app.get("/api/admin/questions", auth, admin, async (_, res) =>
  res.json({
    questions: await Question.find()
      .populate("quizId", "title")
      .sort("-createdAt")
      .lean(),
  }),
);
app.post("/api/admin/quizzes", auth, admin, async (req, res) => {
  const quiz = await Quiz.create({
    title: req.body.title?.trim(),
    description: req.body.description?.trim(),
    isActive: req.body.isActive !== false,
  });
  res.status(201).json({ quiz });
});
app.patch("/api/admin/quizzes/:id", auth, admin, async (req, res) => {
  res.json({
    quiz: await Quiz.findByIdAndUpdate(req.params.id, req.body, { new: true }),
  });
});
app.post("/api/admin/questions", auth, admin, async (req, res) => {
  if (
    !req.body.quizId ||
    !req.body.questionText ||
    !req.body.correctAnswer ||
    !["multiple_choice", "text"].includes(req.body.questionType)
  )
    return res.status(400).json({
      message: "Quiz, question type, text, and correct answer are required.",
    });
  const question = await Question.create(req.body);
  res.status(201).json({ question });
});
app.put("/api/admin/questions/:id", auth, admin, async (req, res) =>
  res.json({
    question: await Question.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    }),
  }),
);
app.delete("/api/admin/questions/:id", auth, admin, async (req, res) => {
  await Question.findByIdAndDelete(req.params.id);
  res.status(204).end();
});
app.post("/api/admin/questions/import", auth, admin, async (req, res) => {
  try {
    const rows = parse(req.body.csv || "", {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    const errors = [];
    const docs = [];
    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2;
      const type =
        row.questionType === "multiple_choice"
          ? "multiple_choice"
          : row.questionType === "text"
            ? "text"
            : "";
      const options = [
        row.optionA,
        row.optionB,
        row.optionC,
        row.optionD,
      ].filter(Boolean);
      if (
        !row.questionText ||
        !type ||
        !row.correctAnswer ||
        (type === "multiple_choice" && options.length < 2)
      )
        errors.push(
          `Row ${rowNumber}: questionText, questionType, correctAnswer, and valid options are required.`,
        );
      else
        docs.push({
          quizId: req.body.quizId,
          questionText: row.questionText,
          questionType: type,
          options: type === "multiple_choice" ? options : [],
          correctAnswer: row.correctAnswer,
        });
    }
    if (errors.length)
      return res
        .status(400)
        .json({ message: "No questions were imported.", errors });
    await Question.insertMany(docs);
    res.json({ imported: docs.length });
  } catch {
    res.status(400).json({ message: "The CSV file could not be read." });
  }
});

async function sendResultEmail(userId, attempt) {
  if (
    !process.env.BREVO_SMTP_USER ||
    !process.env.BREVO_SMTP_PASSWORD ||
    !process.env.BREVO_FROM_EMAIL
  )
    return;
  const user = await User.findById(userId);
  const quiz = await Quiz.findById(attempt.quizId);
  const transport = nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST,
    port: Number(process.env.BREVO_SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.BREVO_SMTP_USER,
      pass: process.env.BREVO_SMTP_PASSWORD,
    },
  });
  await transport.sendMail({
    from: `"${process.env.BREVO_FROM_NAME || "Quizline"}" <${process.env.BREVO_FROM_EMAIL}>`,
    to: user.email,
    subject: `Your Quiz Result - ${quiz.title}`,
    html: `<div style="font-family:Arial;color:#17202a"><h1>Quiz complete</h1><p>Hello ${user.fullName},</p><p>Here is your result for <strong>${quiz.title}</strong>.</p><h2>${attempt.percentage}%</h2><p>${attempt.correctAnswers} correct · ${attempt.incorrectAnswers} incorrect · ${attempt.unanswered} unanswered</p></div>`,
  });
}

const port = Number(process.env.PORT || 4000);
const mongoUri =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/quiz_platform";

async function connectDatabase(retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
      return;
    } catch (error) {
      if (attempt === retries) throw error;
      const delay = attempt * 2000;
      console.error(
        `MongoDB connection attempt ${attempt}/${retries} failed. Retrying in ${delay / 1000}s.`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

connectDatabase()
  .then(() => {
    const server = app.listen(port, () =>
      console.log(`API listening on ${port}`),
    );
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(
          `API port ${port} is already in use. Stop the existing server or choose another PORT.`,
        );
        process.exit(0);
      }
      console.error("API server failed:", error.message);
      process.exit(1);
    });
  })
  .catch((error) => {
    const dnsFailure =
      error.code === "ESERVFAIL" ||
      error.code === "ENOTFOUND" ||
      error.message.includes("querySrv") ||
      error.message.includes("queryTxt") ||
      error.message.includes("getaddrinfo");
    console.error(
      dnsFailure
        ? "MongoDB Atlas DNS lookup failed. Change your Mac DNS to 1.1.1.1 or 8.8.8.8, or use Atlas's standard mongodb:// connection string instead of mongodb+srv://."
        : "MongoDB connection failed after 5 attempts. Check the Atlas cluster hostname, IP allowlist, credentials, and network connection.",
    );
    console.error(error.message);
    process.exit(1);
  });
