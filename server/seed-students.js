import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User, ApprovedEmail } from "./models.js";

const students = [
  {
    email: "frontend@example.com",
    fullName: "Frontend Student",
    track: "frontend",
  },
  {
    email: "backend@example.com",
    fullName: "Backend Student",
    track: "backend",
  },
  {
    email: "product@example.com",
    fullName: "Product Student",
    track: "product",
  },
];
const password = process.env.SEED_STUDENT_PASSWORD;

if (!password || password.length < 8)
  throw new Error(
    "Set an 8-character SEED_STUDENT_PASSWORD in .env before seeding development students.",
  );

await mongoose.connect(
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/quiz_platform",
);
try {
  const passwordHash = await bcrypt.hash(password, 12);
  let created = 0;
  let preserved = 0;
  for (const student of students) {
    const result = await User.updateOne(
      { email: student.email },
      {
        $setOnInsert: {
          ...student,
          passwordHash,
          role: "user",
          isApproved: true,
        },
      },
      { upsert: true, setDefaultsOnInsert: true, runValidators: true },
    );
    if (result.upsertedCount) created += 1;
    else preserved += 1;
    await ApprovedEmail.updateOne(
      { email: student.email },
      { $setOnInsert: { email: student.email } },
      { upsert: true },
    );
  }
  console.log(
    `Development student accounts ready. Created: ${created}; existing accounts preserved: ${preserved}.`,
  );
} finally {
  await mongoose.disconnect();
}
