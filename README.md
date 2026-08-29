# Quizline

Full-stack quiz platform using React, Vite, Express, MongoDB, and Mongoose.

## Run locally

1. Copy `.env.example` to `.env` and set `MONGODB_URI` and a long `JWT_SECRET`.
2. Run `npm install`.
3. Create the first administrator:

```bash
npm run seed:admin -- admin@example.com ChangeMe123! "Quiz Admin"
```

The seed command also adds the email to the approved registration list. Add additional approved emails in MongoDB's `approvedemails` collection, or expose an admin-only approval workflow before production use.

4. Start the API and client with `npm run dev`.
5. Open http://localhost:5173.

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

Authentication uses an HTTP-only JWT cookie. Quiz answers are scored only by the server against Mongoose question records. Correct answers are excluded from the start payload, attempts are scoped to the authenticated user, completed attempts cannot be submitted twice, and admin endpoints require the `admin` role.

## Production notes

Use HTTPS, a managed MongoDB deployment, a strong secret, restrictive CORS, and a real admin approval interface before launch. Run `npm audit` and review the current dependency findings before deploying.
