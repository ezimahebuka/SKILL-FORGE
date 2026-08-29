import { app, connectDatabase } from "../server/index.js";

let databaseConnection;

export default async function handler(request, response) {
  databaseConnection ||= connectDatabase(1);
  try {
    await databaseConnection;
    return app(request, response);
  } catch (error) {
    console.error("Vercel database connection failed:", error.message);
    return response
      .status(503)
      .json({ message: "Database connection unavailable." });
  }
}
