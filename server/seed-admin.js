import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User, ApprovedEmail } from "./models.js";

const email = "nwejeebuka@gmail.com";
const password = "@Eflexcode1996";
const fullName = "Quizline Admin";

if (!email)
  throw new Error(
    'Usage: npm run seed:admin -- admin@example.com StrongPassword "Admin Name"',
  );
await mongoose.connect(process.env.MONGODB_URI);
const passwordHash = await bcrypt.hash(password, 12);
await User.findOneAndUpdate(
  { email },
  { fullName, email, passwordHash, role: "admin", isApproved: true },
  { upsert: true, new: true, setDefaultsOnInsert: true },
);
await ApprovedEmail.updateOne({ email }, { email }, { upsert: true });
console.log(`Admin ready: ${email}`);
await mongoose.disconnect();
