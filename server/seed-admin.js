import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User, ApprovedEmail } from "./models.js";

const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
const fullName = process.env.SEED_ADMIN_NAME?.trim() || "Quizline Admin";

if (!email || !password || password.length < 8)
  throw new Error(
    "Set SEED_ADMIN_EMAIL and an 8-character SEED_ADMIN_PASSWORD in .env before seeding.",
  );

await mongoose.connect(
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/quiz_platform",
);
try {
  const existing = await User.findOne({ email });
  if (existing && existing.role !== "admin")
    throw new Error(
      "The configured administrator email belongs to a student account.",
    );
  if (!existing) {
    await User.create({
      fullName,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: "admin",
      isApproved: true,
    });
  }
  await ApprovedEmail.updateOne(
    { email },
    { $setOnInsert: { email } },
    { upsert: true },
  );
  console.log(
    existing
      ? "Existing administrator preserved and approved."
      : "Administrator created and approved.",
  );
} finally {
  await mongoose.disconnect();
}
