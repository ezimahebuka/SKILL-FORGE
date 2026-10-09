# Quizline

Full-stack quiz platform using React, Vite, Express, MongoDB, and Mongoose.

## Run locally

1. Copy `.env.example` to `.env` and set `MONGODB_URI` and a long `JWT_SECRET`. Set local-only `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` before creating an administrator. Set `SEED_STUDENT_PASSWORD` if you want development student accounts.
2. Run `npm install`.
3. Create the first administrator. The seed only creates a new account; it does not change an existing account's password or profile.

```bash
npm run seed:admin
```

The seed command also adds the email to the approved registration list. Seed three local test students with separate track assignments using `npm run seed:students`. All three use the password in `SEED_STUDENT_PASSWORD`; the development-only accounts are `frontend@example.com`, `backend@example.com`, and `product@example.com`. Existing accounts with those email addresses are preserved without changing their track, password, or profile.

4. Start the API and client with `npm run dev`.
5. Open http://localhost:5173.

## Learning tracks and existing data

Students are assigned `frontend`, `backend`, or `product` tracks. Admins assign or change student tracks in the **Users** tab. Students with no valid track see an assignment notice and cannot access quiz APIs. Student registration does not accept a track from the browser.

Quizzes must have a valid track before they can be created or activated. Admins can assign tracks to existing quizzes in the **Quizzes** tab. Existing quiz documents without a track are intentionally left unassigned and are never shown to students until an admin assigns one. There is no bulk migration or automatic mapping, so existing user and quiz records, attempts, and scores are preserved. The HTML seed quiz is assigned to Frontend Development.

## Track facilitators

Facilitators use the separate `facilitator` role and a database-assigned track. Their login opens the management dashboard, where student lists, quizzes, questions, results, and statistics are restricted to that track at the API query layer. Facilitators cannot reassign tracks or access another track by changing a URL or request. The global `admin` role retains cross-track management and can assign tracks to student and facilitator accounts.

For local testing, set `SEED_FACILITATOR_PASSWORD` in `.env` and run `npm run seed:facilitators`. This creates `frontend-facilitator@example.com`, `backend-facilitator@example.com`, and `product-facilitator@example.com` only when absent; existing accounts are preserved. Existing users with the `admin` role remain global administrators. Assign production facilitator roles and tracks only through a trusted admin workflow or an explicit data migration.

## Tests

Run `npm test` with MongoDB available locally. Integration tests use and clear only the dedicated `quiz_platform_tracks_test` database, not the application database.

## Approved emails

Add approved addresses to `server/email.js`. Run `npm run seed:emails` to normalize, deduplicate, and save them to MongoDB. You can also pass addresses directly to override the file:

```bash
npm run seed:emails -- "person@example.com" "other@example.com"
```

## Brevo SMTP

Set `BREVO_SMTP_HOST`, `BREVO_SMTP_PORT`, `BREVO_SMTP_USER`, `BREVO_SMTP_PASSWORD`, `BREVO_FROM_EMAIL`, and `BREVO_FROM_NAME` in `.env`. The result is saved before email delivery; SMTP failure is logged by the API and does not fail quiz submission.

## Quiz recording

Before a quiz starts, the participant must explicitly allow webcam and screen access. The app combines both streams into a WebM recording and uploads it directly to Cloudinary after submission. The result is saved even if recording or upload fails. Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in `.env` and in the Vercel project environment variables. Admins can open recordings from the **Results** tab.

## Question import

Create a quiz with `POST /api/admin/quizzes`, then import `sample-questions.csv` with `POST /api/admin/questions/import` using the quiz ID. Rows are validated before insertion, so an invalid file is not partially imported.

## API security

Authentication uses an HTTP-only JWT cookie and reloads the user's role and track from MongoDB on each request. Quiz answers are scored only by the server against Mongoose question records. Correct answers are excluded from the start payload, student attempts and results are scoped to the authenticated account and assigned track, completed attempts cannot be submitted twice, and staff endpoints enforce either global `admin` permissions or database-backed `facilitator` track scope.

## Production notes

Use HTTPS, a managed MongoDB deployment, a strong secret, restrictive CORS, and a real admin approval interface before launch. Run `npm audit` and review the current dependency findings before deploying.
