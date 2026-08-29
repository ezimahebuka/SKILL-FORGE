import "dotenv/config";
import mongoose from "mongoose";
import { ApprovedEmail } from "./models.js";
import emailsFromFile from "./email.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export async function seedEmails(emailList) {
  if (!Array.isArray(emailList)) {
    throw new TypeError("seedEmails expects an array of email addresses.");
  }

  const normalizedEmails = [
    ...new Set(emailList.map(normalizeEmail).filter(Boolean)),
  ];
  const invalidEmails = normalizedEmails.filter(
    (email) => !emailPattern.test(email),
  );

  if (invalidEmails.length) {
    throw new Error(`Invalid email address: ${invalidEmails[0]}`);
  }

  if (!normalizedEmails.length) return { inserted: 0, total: 0 };

  const operations = normalizedEmails.map((email) => ({
    updateOne: {
      filter: { email },
      update: { $setOnInsert: { email } },
      upsert: true,
    },
  }));
  const result = await ApprovedEmail.bulkWrite(operations, { ordered: false });

  return {
    inserted: result.upsertedCount,
    total: normalizedEmails.length,
  };
}

if (process.argv[1]?.endsWith("seedEmails.js")) {
  const emails = process.argv.slice(2);
  const emailsToSeed = emails.length ? emails : emailsFromFile;

  if (!emailsToSeed.length) {
    console.error(
      "Usage: node server/seedEmails.js email@example.com another@example.com",
    );
    process.exitCode = 1;
  } else {
    try {
      await mongoose.connect(
        process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/quiz_platform",
      );
      const result = await seedEmails(emailsToSeed);
      console.log(
        `Approved emails ready. New: ${result.inserted}. Total: ${result.total}.`,
      );
    } catch (error) {
      console.error("Could not seed approved emails:", error.message);
      process.exitCode = 1;
    } finally {
      await mongoose.disconnect();
    }
  }
}
