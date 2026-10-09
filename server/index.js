import "dotenv/config";
import "express-async-errors";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { parse } from "csv-parse/sync";
import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";
import { User, ApprovedEmail, Quiz, Question, Attempt } from "./models.js";

const app = express();
const validTracks = new Set(["frontend", "backend", "product"]);
app.use("/api", (_, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
  "https://the-skill-forge.vercel.app",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
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
  track: user.track,
});
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function auth(req, res, next) {
  let claims;
  try {
    claims = jwt.verify(req.cookies.quiz_token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: "Authentication required." });
  }
  const user = await User.findById(claims.id);
  if (!user || user.isDisabled || !user.isApproved)
    return res.status(401).json({ message: "Authentication required." });
  req.user = user;
  next();
}
function studentTrack(req, res) {
  if (req.user.role === "admin") return null;
  if (req.user.role !== "user") {
    res.status(403).json({ message: "Student access required." });
    return false;
  }
  if (!validTracks.has(req.user.track)) {
    res.status(403).json({
      message:
        "Your account does not have a learning track assigned. Contact an administrator.",
    });
    return false;
  }
  return req.user.track;
}
function admin(req, res, next) {
  if (!["admin", "facilitator"].includes(req.user.role))
    return res.status(403).json({ message: "Facilitator access required." });
  if (req.user.role === "facilitator" && !validTracks.has(req.user.track))
    return res.status(403).json({
      message:
        "Your facilitator account does not have a valid learning track assigned.",
    });
  next();
}
const staffTrack = (user) => (user.role === "facilitator" ? user.track : null);
const scopedQuizFilter = (user, filter = {}) =>
  user.role === "facilitator" ? { ...filter, track: user.track } : filter;
const scopedStudentFilter = (user, filter = {}) =>
  user.role === "facilitator"
    ? { ...filter, role: "user", track: user.track }
    : filter;
async function canManageQuiz(user, quizId) {
  const filter = { _id: quizId };
  if (user.role === "facilitator") filter.track = user.track;
  return Quiz.findOne(filter);
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
  let user;
  try {
    user = await User.findOne({ email: normalize(req.body.email) });
  } catch (error) {
    return res.status(503).json({
      message: "Database connection unavailable. Please retry shortly.",
    });
  }
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
    path: "/",
  });
  res.json({ user: publicUser(user) });
});
app.post("/api/auth/logout", (_, res) => {
  res.clearCookie("quiz_token", { path: "/" });
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

app.get("/api/quizzes", auth, async (req, res) => {
  const track = studentTrack(req, res);
  if (track === false) return;
  const filter = { isActive: true };
  if (track) filter.track = track;
  res.json({ quizzes: await Quiz.find(filter).lean() });
});
app.get("/api/quizzes/:id", auth, async (req, res) => {
  const track = studentTrack(req, res);
  if (track === false) return;
  const filter = {
    _id: req.params.id,
    isActive: true,
  };
  if (track) filter.track = track;
  const quiz = await Quiz.findOne(filter).lean();
  if (!quiz) return res.status(404).json({ message: "Quiz not found." });
  const questionCount = await Question.countDocuments({ quizId: quiz._id });
  res.json({ quiz: { ...quiz, questionCount } });
});
app.post("/api/quizzes/:id/start", auth, async (req, res) => {
  const track = studentTrack(req, res);
  if (track === false) return;
  const filter = { _id: req.params.id, isActive: true };
  if (track) filter.track = track;
  const quiz = await Quiz.findOne(filter);
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
app.post("/api/uploads/video-signature", auth, async (req, res) => {
  const track = studentTrack(req, res);
  if (track === false) return;
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  )
    return res
      .status(503)
      .json({ message: "Video storage is not configured." });
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `skillforge/attempts/${req.user.id}`;
  const signature = cloudinary.utils.api_sign_request(
    { folder, timestamp },
    process.env.CLOUDINARY_API_SECRET,
  );
  res.json({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    timestamp,
    folder,
    signature,
  });
});
app.patch(
  "/api/quizzes/:id/attempts/:attemptId/video",
  auth,
  async (req, res) => {
    const track = studentTrack(req, res);
    if (track === false) return;
    if (track && !(await Quiz.exists({ _id: req.params.id, track })))
      return res.status(404).json({ message: "Completed attempt not found." });
    const attempt = await Attempt.findOneAndUpdate(
      {
        _id: req.params.attemptId,
        quizId: req.params.id,
        userId: req.user.id,
        status: "completed",
      },
      { videoUrl: req.body.videoUrl, videoPublicId: req.body.videoPublicId },
      { new: true },
    );
    if (!attempt)
      return res.status(404).json({ message: "Completed attempt not found." });
    res.json({ videoUrl: attempt.videoUrl });
  },
);
app.post("/api/quizzes/:id/submit", auth, async (req, res) => {
  const track = studentTrack(req, res);
  if (track === false) return;
  if (track && !(await Quiz.exists({ _id: req.params.id, track })))
    return res.status(404).json({ message: "Quiz not found." });
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
    if (question.requiresManualGrading)
      return {
        questionId: question._id,
        answer,
        isCorrect: null,
        requiresManualGrading: true,
      };
    return {
      questionId: question._id,
      answer,
      isCorrect:
        Boolean(answer) &&
        normalize(answer) === normalize(question.correctAnswer),
    };
  });
  const correctAnswers = answers.filter((item) => item.isCorrect).length;
  const gradedQuestions = answers.filter(
    (item) => !item.requiresManualGrading,
  ).length;
  const unanswered = answers.filter(
    (item) => !String(item.answer).trim(),
  ).length;
  const pendingReview = answers.filter(
    (item) => item.requiresManualGrading && String(item.answer).trim(),
  ).length;
  const completion = {
    answers,
    totalQuestions: questions.length,
    gradedQuestions,
    correctAnswers,
    unanswered,
    pendingReview,
    incorrectAnswers: gradedQuestions - correctAnswers - answers.filter(
      (item) => !item.requiresManualGrading && !String(item.answer).trim(),
    ).length,
    score: correctAnswers,
    percentage: gradedQuestions
      ? Math.round((correctAnswers / gradedQuestions) * 100)
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
  const filter = { _id: req.params.id, status: "completed" };
  if (req.user.role === "user") filter.userId = req.user._id;
  const attempt = await Attempt.findOne(filter)
    .populate("quizId", "title track")
    .populate("userId", "fullName email track")
    .lean();
  if (!attempt) return res.status(404).json({ message: "Result not found." });
  if (req.user.role === "user" && attempt.quizId?.track !== req.user.track)
    return res.status(404).json({ message: "Result not found." });
  if (
    req.user.role === "facilitator" &&
    (attempt.quizId?.track !== req.user.track ||
      attempt.userId?.track !== req.user.track)
  )
    return res.status(404).json({ message: "Result not found." });
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

app.get("/api/admin/stats", auth, admin, async (req, res) => {
  const [students, quizzes, questionCount] = await Promise.all([
    User.countDocuments(scopedStudentFilter(req.user, { role: "user" })),
    Quiz.find(scopedQuizFilter(req.user)).select("_id").lean(),
    req.user.role === "facilitator" ? 0 : Question.countDocuments(),
  ]);
  const quizIds = quizzes.map((quiz) => quiz._id);
  const quizFilter =
    req.user.role === "facilitator" ? { quizId: { $in: quizIds } } : {};
  const userIds =
    req.user.role === "facilitator"
      ? await User.find(scopedStudentFilter(req.user)).distinct("_id")
      : null;
  const attemptFilter = {
    status: "completed",
    ...quizFilter,
    ...(userIds ? { userId: { $in: userIds } } : {}),
  };
  const [attempts, questions, scores] = await Promise.all([
    Attempt.countDocuments(attemptFilter),
    req.user.role === "facilitator"
      ? Question.countDocuments({ quizId: { $in: quizIds } })
      : questionCount,
    Attempt.aggregate([
      { $match: attemptFilter },
      {
        $group: {
          _id: null,
          average: { $avg: "$percentage" },
          highest: { $max: "$percentage" },
          passed: {
            $sum: { $cond: [{ $gte: ["$percentage", 60] }, 1, 0] },
          },
        },
      },
    ]),
  ]);
  res.json({
    stats: {
      users: students,
      students,
      quizzes: quizzes.length,
      attempts,
      questions,
      average: Math.round(scores[0]?.average || 0),
      highest: scores[0]?.highest || 0,
      passRate: attempts ? Math.round((scores[0]?.passed / attempts) * 100) : 0,
    },
  });
});
app.get("/api/admin/users", auth, admin, async (req, res) =>
  res.json({
    users: await User.find(scopedStudentFilter(req.user))
      .select("-passwordHash")
      .sort("-createdAt")
      .lean(),
  }),
);
app.patch("/api/admin/users/:id", auth, admin, async (req, res) => {
  const existing = await User.findOne(
    scopedStudentFilter(req.user, { _id: req.params.id }),
  );
  if (!existing) return res.status(404).json({ message: "User not found." });
  const updates = {};
  if ("isApproved" in req.body)
    updates.isApproved = Boolean(req.body.isApproved);
  if ("isDisabled" in req.body)
    updates.isDisabled = Boolean(req.body.isDisabled);
  const unset = {};
  if ("track" in req.body) {
    if (req.user.role === "facilitator")
      return res.status(403).json({
        message: "Facilitators cannot change student track assignments.",
      });
    if (!["user", "facilitator"].includes(existing.role))
      return res.status(400).json({
        message: "Only students and facilitators can be assigned a track.",
      });
    if (req.body.track === "") unset.track = 1;
    else if (!validTracks.has(req.body.track))
      return res
        .status(400)
        .json({ message: "Select a valid learning track." });
    else updates.track = req.body.track;
  }
  const update = {};
  if (Object.keys(updates).length) update.$set = updates;
  if (Object.keys(unset).length) update.$unset = unset;
  const user = await User.findByIdAndUpdate(req.params.id, update, {
    new: true,
    runValidators: true,
  }).select("-passwordHash");
  res.json({ user });
});
app.delete("/api/admin/users/:id", auth, admin, async (req, res) => {
  if (req.params.id === req.user.id)
    return res
      .status(400)
      .json({ message: "You cannot delete your own admin account." });
  const user = await User.findOne(
    scopedStudentFilter(req.user, { _id: req.params.id }),
  );
  if (!user) return res.status(404).json({ message: "User not found." });
  if (
    req.user.role === "admin" &&
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
app.get("/api/admin/results", auth, admin, async (req, res) => {
  let filter = { status: "completed" };
  if (req.user.role === "facilitator") {
    const [quizIds, userIds] = await Promise.all([
      Quiz.find({ track: staffTrack(req.user) }).distinct("_id"),
      User.find(scopedStudentFilter(req.user)).distinct("_id"),
    ]);
    filter = { ...filter, quizId: { $in: quizIds }, userId: { $in: userIds } };
  }
  res.json({
    results: await Attempt.find(filter)
      .populate("userId", "fullName email track")
      .populate("quizId", "title track")
      .sort("-completedAt")
      .lean(),
  });
});
app.delete("/api/admin/results/:id", auth, admin, async (req, res) => {
  const filter = { _id: req.params.id, status: "completed" };
  if (req.user.role === "facilitator") {
    const [quizIds, userIds] = await Promise.all([
      Quiz.find({ track: staffTrack(req.user) }).distinct("_id"),
      User.find(scopedStudentFilter(req.user)).distinct("_id"),
    ]);
    filter.quizId = { $in: quizIds };
    filter.userId = { $in: userIds };
  }
  const result = await Attempt.findOneAndDelete(filter);
  if (!result) return res.status(404).json({ message: "Result not found." });
  res.status(204).end();
});
app.get("/api/admin/quizzes", auth, admin, async (req, res) =>
  res.json({
    quizzes: await Quiz.find(scopedQuizFilter(req.user))
      .sort("-createdAt")
      .lean(),
  }),
);
app.get("/api/admin/questions", auth, admin, async (req, res) => {
  const quizIds =
    req.user.role === "facilitator"
      ? await Quiz.find({ track: staffTrack(req.user) }).distinct("_id")
      : null;
  const filter = quizIds ? { quizId: { $in: quizIds } } : {};
  res.json({
    questions: await Question.find(filter)
      .populate("quizId", "title track")
      .sort("-createdAt")
      .lean(),
  });
});
app.post("/api/admin/quizzes", auth, admin, async (req, res) => {
  const track = staffTrack(req.user) || req.body.track;
  if (!validTracks.has(track))
    return res.status(400).json({ message: "Select a valid learning track." });
  if (
    req.user.role === "facilitator" &&
    "track" in req.body &&
    req.body.track !== req.user.track
  )
    return res.status(403).json({
      message: "You can only create quizzes for your assigned track.",
    });
  if (
    typeof req.body.title !== "string" ||
    !req.body.title.trim() ||
    typeof req.body.description !== "string" ||
    !req.body.description.trim()
  )
    return res
      .status(400)
      .json({ message: "Title and description are required." });
  const quiz = await Quiz.create({
    title: req.body.title?.trim(),
    description: req.body.description?.trim(),
    track,
    isActive: req.body.isActive !== false,
  });
  res.status(201).json({ quiz });
});
app.patch("/api/admin/quizzes/:id", auth, admin, async (req, res) => {
  const existing = await canManageQuiz(req.user, req.params.id);
  if (!existing) return res.status(404).json({ message: "Quiz not found." });
  const updates = {};
  let clearTrack = false;
  if ("track" in req.body) {
    if (req.user.role === "facilitator" && req.body.track !== req.user.track)
      return res
        .status(403)
        .json({ message: "You cannot change a quiz's assigned track." });
    if (req.body.track === "") clearTrack = true;
    else if (!validTracks.has(req.body.track))
      return res
        .status(400)
        .json({ message: "Select a valid learning track." });
    else updates.track = req.body.track;
  }
  if ("title" in req.body) {
    if (typeof req.body.title !== "string" || !req.body.title.trim())
      return res.status(400).json({ message: "Title is required." });
    updates.title = req.body.title.trim();
  }
  if ("description" in req.body) {
    if (
      typeof req.body.description !== "string" ||
      !req.body.description.trim()
    )
      return res.status(400).json({ message: "Description is required." });
    updates.description = req.body.description.trim();
  }
  if ("isActive" in req.body) {
    if (typeof req.body.isActive !== "boolean")
      return res
        .status(400)
        .json({ message: "Quiz status must be true or false." });
    updates.isActive = req.body.isActive;
  }
  const nextTrack = clearTrack ? undefined : (updates.track ?? existing.track);
  const nextIsActive = updates.isActive ?? existing.isActive;
  if (nextIsActive && !validTracks.has(nextTrack))
    return res.status(400).json({
      message:
        "Assign a learning track before activating this quiz, or deactivate it before removing its track.",
    });
  const update = {};
  if (Object.keys(updates).length) update.$set = updates;
  if (clearTrack) update.$unset = { track: 1 };
  const quiz = await Quiz.findByIdAndUpdate(req.params.id, update, {
    new: true,
    runValidators: true,
  });
  res.json({ quiz });
});
app.post("/api/admin/questions", auth, admin, async (req, res) => {
  if (
    !req.body.quizId ||
    !req.body.questionText ||
    (!req.body.correctAnswer && req.body.questionType !== "text") ||
    !["multiple_choice", "text"].includes(req.body.questionType)
  )
    return res.status(400).json({
      message: "Quiz, question type, text, and correct answer are required.",
    });
  if (!(await canManageQuiz(req.user, req.body.quizId)))
    return res.status(404).json({ message: "Quiz not found." });
  const question = await Question.create({
    ...req.body,
    correctAnswer: req.body.correctAnswer || "",
    requiresManualGrading:
      req.body.questionType === "text" && !req.body.correctAnswer,
  });
  res.status(201).json({ question });
});
app.put("/api/admin/questions/:id", auth, admin, async (req, res) => {
  const question = await Question.findById(req.params.id);
  if (!question || !(await canManageQuiz(req.user, question.quizId)))
    return res.status(404).json({ message: "Question not found." });
  if (req.body.quizId && !(await canManageQuiz(req.user, req.body.quizId)))
    return res.status(404).json({ message: "Quiz not found." });
  const updated = await Question.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  res.json({ question: updated });
});
app.delete("/api/admin/questions/:id", auth, admin, async (req, res) => {
  const question = await Question.findById(req.params.id);
  if (!question || !(await canManageQuiz(req.user, question.quizId)))
    return res.status(404).json({ message: "Question not found." });
  await question.deleteOne();
  res.status(204).end();
});
app.post("/api/admin/questions/import", auth, admin, async (req, res) => {
  if (!(await canManageQuiz(req.user, req.body.quizId)))
    return res.status(404).json({ message: "Quiz not found." });
  if (typeof req.body.csv !== "string" || !req.body.csv.trim())
    return res
      .status(400)
      .json({ message: "Choose a CSV file or paste CSV content first." });

  let records;
  try {
    records = parse(req.body.csv, {
      columns: false,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true,
    });
  } catch {
    return res.status(400).json({
      message:
        "The CSV format could not be parsed. Check that the first row contains the required column headers.",
    });
  }
  const headers = records.shift()?.map((header) => header.trim());
  if (!headers?.length)
    return res.status(400).json({ message: "The CSV file has no header row." });
  const headerIndexes = new Map(
    headers.map((header, index) => [header.toLowerCase(), index]),
  );
  const isQuestionIdFormat = headerIndexes.has("question id");
  const requiredHeaders = isQuestionIdFormat
    ? ["section", "question", "option a", "option b", "correct answer"]
    : ["questiontext", "questiontype", "optiona", "optionb", "correctanswer"];
  const missingHeaders = requiredHeaders.filter(
    (header) => !headerIndexes.has(header),
  );
  if (missingHeaders.length)
    return res.status(400).json({
      message: `CSV is missing required column(s): ${missingHeaders.join(", ")}.`,
    });

  const getValue = (row, header) =>
    String(row[headerIndexes.get(header.toLowerCase())] ?? "").trim();
  const errors = [];
  const docs = [];
  let manualReviewQuestions = 0;
  for (const [index, row] of records.entries()) {
    const rowNumber = index + 2;
    const sectionOrType = getValue(
      row,
      isQuestionIdFormat ? "section" : "questionType",
    );
    const normalizedSection = sectionOrType.toLowerCase();
    const isTheory = isQuestionIdFormat && normalizedSection === "theory";
    const type = isTheory
      ? "text"
      : isQuestionIdFormat
        ? ["objective", "multiple_choice", "mcq"].includes(
            normalizedSection,
          )
          ? "multiple_choice"
          : ""
        : ["multiple_choice", "text"].includes(sectionOrType)
          ? sectionOrType
          : "";
    const questionText = getValue(
      row,
      isQuestionIdFormat ? "question" : "questionText",
    );
    const options = ["a", "b", "c", "d"]
      .map((letter) =>
        getValue(
          row,
          isQuestionIdFormat ? `option ${letter}` : `option${letter}`,
        ),
      )
      .filter(Boolean);
    let correctAnswer = getValue(
      row,
      isQuestionIdFormat ? "correct answer" : "correctAnswer",
    );
    if (isQuestionIdFormat && /^[a-d]$/i.test(correctAnswer)) {
      correctAnswer =
        options[correctAnswer.toUpperCase().charCodeAt(0) - 65] || "";
    }
    const requiresManualGrading = isTheory || (type === "text" && !correctAnswer);
    if (
      !questionText ||
      !type ||
      (!requiresManualGrading && !correctAnswer) ||
      (type === "multiple_choice" && options.length < 2)
    )
      errors.push(
        `Row ${rowNumber}: questionText, questionType, correctAnswer, and valid options are required.`,
      );
    else {
      if (requiresManualGrading) manualReviewQuestions += 1;
      docs.push({
        quizId: req.body.quizId,
        questionText,
        questionType: type,
        options: type === "multiple_choice" ? options : [],
        correctAnswer: requiresManualGrading ? "" : correctAnswer,
        requiresManualGrading,
      });
    }
  }
  if (!records.length)
    return res
      .status(400)
      .json({ message: "The CSV file contains no question rows." });
  if (errors.length && !docs.length)
    return res.status(400).json({
      message: `No questions were imported. ${errors.join(" ")}`,
      errors,
    });
  if (docs.length) await Question.insertMany(docs);
  const warnings = [
    ...(manualReviewQuestions
      ? [
          `${manualReviewQuestions} text/theory question(s) were imported and require manual review because no answer key was provided.`,
        ]
      : []),
    ...(errors.length
      ? [`${errors.length} invalid row(s) skipped. ${errors.join(" ")}`]
      : []),
  ];
  res.json({
    imported: docs.length,
    skipped: errors.length,
    requiresManualGrading: manualReviewQuestions,
    warnings,
  });
});

app.use((error, _req, res, _next) => {
  console.error("API request failed:", error.message);
  if (res.headersSent) return;
  const databaseUnavailable =
    error instanceof mongoose.Error ||
    error.name?.includes("Mongo") ||
    ["ENOTFOUND", "ESERVFAIL", "ECONNRESET", "ETIMEDOUT"].includes(error.code);
  res.status(databaseUnavailable ? 503 : 500).json({
    message: databaseUnavailable
      ? "Database connection unavailable. Please retry shortly."
      : "The server could not complete this request.",
  });
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

export async function connectDatabase(retries = 5) {
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

export { app };

if (!process.env.VERCEL) {
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
          process.exit(1);
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
}
