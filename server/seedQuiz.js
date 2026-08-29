import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { parse } from "csv-parse/sync";
import { Question, Quiz } from "./models.js";

const csvPath = fileURLToPath(
  new URL("../html-quiz-questions.csv", import.meta.url),
);
const rows = parse(readFileSync(csvPath), {
  columns: true,
  skip_empty_lines: true,
  trim: true,
});

try {
  await mongoose.connect(
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/quiz_platform",
  );
  const quiz = await Quiz.findOneAndUpdate(
    { title: "Html Quiz" },
    {
      title: "Html Quiz",
      description:
        "A focused challenge covering HTML and the foundations of the web.",
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const operations = rows.map((row) => {
    const options = [row.optionA, row.optionB, row.optionC, row.optionD].filter(
      Boolean,
    );
    return {
      updateOne: {
        filter: { quizId: quiz._id, questionText: row.questionText },
        update: {
          $set: {
            quizId: quiz._id,
            questionText: row.questionText,
            questionType: row.questionType,
            options: row.questionType === "text" ? [] : options,
            correctAnswer: row.correctAnswer,
          },
        },
        upsert: true,
      },
    };
  });
  const result = await Question.bulkWrite(operations, { ordered: false });
  console.log(
    `Html Quiz ready with ${rows.length} questions. New: ${result.upsertedCount}.`,
  );
} catch (error) {
  console.error("Could not seed the quiz:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
