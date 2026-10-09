import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "./models.js";

const facilitators = [
  {
    email: "nwejeebuka@gmail.com",
    fullName: "Frontend Facilitator",
    track: "frontend",
  },
  {
    email: "chowfinder1@gmail.com",
    fullName: "Backend Facilitator",
    track: "backend",
  },
  {
    email: "chidera@the-curve.africa",
    fullName: "Product Design Facilitator",
    track: "product",
  },
];
const password = process.env.SEED_FACILITATOR_PASSWORD;

if (!password || password.length < 8)
  throw new Error(
    "Set an 8-character SEED_FACILITATOR_PASSWORD in .env before seeding facilitators.",
  );

await mongoose.connect(
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/quiz_platform",
);
try {
  const passwordHash = await bcrypt.hash(password, 12);
  let created = 0;
  let preserved = 0;
  for (const facilitator of facilitators) {
    const result = await User.updateOne(
      { email: facilitator.email },
      {
        $setOnInsert: {
          ...facilitator,
          passwordHash,
          role: "facilitator",
          isApproved: true,
        },
      },
      { upsert: true, setDefaultsOnInsert: true, runValidators: true },
    );
    if (result.upsertedCount) created += 1;
    else preserved += 1;
  }
  console.log(
    `Facilitator accounts ready. Created: ${created}; existing accounts preserved: ${preserved}.`,
  );
} finally {
  await mongoose.disconnect();
}
