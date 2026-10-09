import "dotenv/config";
import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import { ApprovedEmail, User } from "./models.js";
import { studentRoster } from "./studentRoster.js";

const validTracks = new Set(["frontend", "backend", "product"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function assignStudentRoster(roster = studentRoster) {
  const byEmail = new Map();
  for (const item of roster) {
    const email = String(item.email ?? "")
      .trim()
      .toLowerCase();
    if (!emailPattern.test(email) || !validTracks.has(item.track))
      throw new Error("Roster contains an invalid email or track.");
    const previousTrack = byEmail.get(email);
    if (previousTrack && previousTrack !== item.track)
      throw new Error(`Roster assigns conflicting tracks to ${email}.`);
    byEmail.set(email, item.track);
  }

  const entries = [...byEmail].map(([email, track]) => ({ email, track }));
  if (!entries.length)
    return {
      approved: 0,
      assigned: 0,
      alreadyAssigned: 0,
      pending: 0,
      otherRole: 0,
    };

  await ApprovedEmail.bulkWrite(
    entries.map(({ email }) => ({
      updateOne: {
        filter: { email },
        update: { $setOnInsert: { email } },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  const emails = entries.map(({ email }) => email);
  const [existingStudents, existingUsers] = await Promise.all([
    User.find({ email: { $in: emails }, role: "user" })
      .select("email track")
      .lean(),
    User.find({ email: { $in: emails } })
      .select("email role")
      .lean(),
  ]);
  const studentsByEmail = new Map(
    existingStudents.map((student) => [student.email, student]),
  );
  const changes = entries.filter(
    ({ email, track }) =>
      studentsByEmail.has(email) && studentsByEmail.get(email).track !== track,
  );
  if (changes.length)
    await User.bulkWrite(
      changes.map(({ email, track }) => ({
        updateOne: {
          filter: { email, role: "user" },
          update: { $set: { track } },
        },
      })),
      { ordered: false },
    );
  const usersByEmail = new Map(existingUsers.map((user) => [user.email, user]));
  const pending = entries.filter(
    ({ email }) => !usersByEmail.has(email),
  ).length;
  const otherRole = entries.filter(
    ({ email }) => usersByEmail.has(email) && !studentsByEmail.has(email),
  ).length;

  return {
    approved: entries.length,
    assigned: changes.length,
    alreadyAssigned: entries.length - changes.length - pending - otherRole,
    pending,
    otherRole,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/quiz_platform",
    );
    const counts = await assignStudentRoster();
    console.log(
      `Roster processed: ${counts.approved} approved; ${counts.assigned} track assignments updated; ${counts.alreadyAssigned} already assigned; ${counts.pending} awaiting registration; ${counts.otherRole} existing non-student accounts left unchanged.`,
    );
    console.log(
      `Track roster sizes: frontend ${studentRoster.filter((item) => item.track === "frontend").length}, backend ${studentRoster.filter((item) => item.track === "backend").length}, product ${studentRoster.filter((item) => item.track === "product").length}.`,
    );
  } catch (error) {
    console.error("Could not assign the student roster:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
