import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    isApproved: { type: Boolean, default: false },
    isDisabled: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const approvedEmailSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
  },
  { timestamps: true },
);
const quizSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
const questionSchema = new mongoose.Schema(
  {
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", index: true },
    questionText: { type: String, required: true },
    questionType: {
      type: String,
      enum: ["multiple_choice", "text"],
      required: true,
    },
    options: [String],
    correctAnswer: { type: String, required: true },
    questionImage: String,
  },
  { timestamps: true },
);
const attemptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", index: true },
    score: Number,
    totalQuestions: Number,
    correctAnswers: Number,
    incorrectAnswers: Number,
    unanswered: Number,
    percentage: Number,
    answers: [
      {
        questionId: mongoose.Schema.Types.ObjectId,
        answer: String,
        isCorrect: Boolean,
      },
    ],
    startedAt: Date,
    completedAt: Date,
    status: {
      type: String,
      enum: ["in_progress", "completed"],
      default: "in_progress",
    },
  },
  { timestamps: true },
);

export const User = mongoose.model("User", userSchema);
export const ApprovedEmail = mongoose.model(
  "ApprovedEmail",
  approvedEmailSchema,
);
export const Quiz = mongoose.model("Quiz", quizSchema);
export const Question = mongoose.model("Question", questionSchema);
export const Attempt = mongoose.model("Attempt", attemptSchema);
