import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, before, test } from "node:test";

process.env.VERCEL = "1";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/quiz_platform_tracks_test";
process.env.JWT_SECRET = "track-integration-test-secret";

const mongoose = (await import("mongoose")).default;
const bcrypt = (await import("bcryptjs")).default;
const { app, connectDatabase } = await import("../server/index.js");
const { User, ApprovedEmail, Quiz, Question, Attempt } =
  await import("../server/models.js");
const { studentRoster, rosterTrackCounts } =
  await import("../server/studentRoster.js");
const { assignStudentRoster } = await import("../server/seedStudentRoster.js");

const password = "LocalTrackTest123!";
const tracks = ["frontend", "backend", "product"];
let server;
let baseUrl;
let users;
let quizzes;
let question;
let theoryQuestion;
let questionsByTrack;
let studentCookies;
let facilitatorCookies;
let adminCookie;
let activeAttempts;

async function request(path, { cookie, method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = response.status === 204 ? "" : await response.text();
  return { response, data: text ? JSON.parse(text) : null };
}

async function login(email, extra = {}) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, ...extra }),
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  return {
    cookie: response.headers.get("set-cookie").split(";")[0],
    data,
  };
}

before(async () => {
  await connectDatabase(1);
  await mongoose.connection.dropDatabase();
  const passwordHash = await bcrypt.hash(password, 4);
  users = {};
  quizzes = {};
  questionsByTrack = {};
  studentCookies = {};
  facilitatorCookies = {};
  activeAttempts = {};

  for (const track of tracks) {
    users[track] = await User.create({
      fullName: `${track} Student`,
      email: `${track}@tracks.test`,
      passwordHash,
      role: "user",
      track,
      isApproved: true,
    });
    quizzes[track] = await Quiz.create({
      title: `${track} quiz`,
      description: `Quiz for ${track}`,
      track,
      isActive: true,
    });
    questionsByTrack[track] = await Question.create({
      quizId: quizzes[track]._id,
      questionText: `${track} question`,
      questionType: "text",
      options: [],
      correctAnswer: "answer",
    });
    await Attempt.create({
      userId: users[track]._id,
      quizId: quizzes[track]._id,
      score: 1,
      totalQuestions: 1,
      correctAnswers: 1,
      incorrectAnswers: 0,
      unanswered: 0,
      percentage: 80,
      answers: [],
      startedAt: new Date(),
      completedAt: new Date(),
      status: "completed",
    });
    users[`${track}Facilitator`] = await User.create({
      fullName: `${track} Facilitator`,
      email: `${track}-facilitator@tracks.test`,
      passwordHash,
      role: "facilitator",
      track,
      isApproved: true,
    });
  }
  users.admin = await User.create({
    fullName: "Track Admin",
    email: "admin@tracks.test",
    passwordHash,
    role: "admin",
    isApproved: true,
  });
  users.unassigned = await User.create({
    fullName: "Unassigned Student",
    email: "unassigned@tracks.test",
    passwordHash,
    role: "user",
    isApproved: true,
  });
  users.missingTrack = await User.create({
    fullName: "Missing Track Student",
    email: "missing-track@tracks.test",
    passwordHash,
    role: "user",
    isApproved: true,
  });
  quizzes.legacy = await Quiz.create({
    title: "Legacy quiz",
    description: "An existing quiz without a track",
    isActive: true,
  });
  question = await Question.create({
    quizId: quizzes.frontend._id,
    questionText: "Choose the correct answer",
    questionType: "multiple_choice",
    options: ["Correct", "Incorrect"],
    correctAnswer: "Correct",
  });

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  for (const track of tracks) {
    studentCookies[track] = (await login(`${track}@tracks.test`)).cookie;
    facilitatorCookies[track] = (
      await login(`${track}-facilitator@tracks.test`)
    ).cookie;
  }
  adminCookie = (await login("admin@tracks.test")).cookie;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test("students only list and open quizzes for their database track", async () => {
  for (const track of tracks) {
    const { response, data } = await request("/quizzes", {
      cookie: studentCookies[track],
    });
    assert.equal(response.status, 200);
    assert.deepEqual(
      data.quizzes.map((quiz) => quiz.track),
      [track],
    );
    const ownDetail = await request(`/quizzes/${quizzes[track]._id}`, {
      cookie: studentCookies[track],
    });
    assert.equal(ownDetail.response.status, 200);
    const ownStart = await request(`/quizzes/${quizzes[track]._id}/start`, {
      cookie: studentCookies[track],
      method: "POST",
    });
    assert.equal(ownStart.response.status, 200);
    activeAttempts[track] = ownStart.data.attemptId;
    for (const otherTrack of tracks.filter(
      (candidate) => candidate !== track,
    )) {
      const detail = await request(`/quizzes/${quizzes[otherTrack]._id}`, {
        cookie: studentCookies[track],
      });
      assert.equal(detail.response.status, 404);
      const start = await request(`/quizzes/${quizzes[otherTrack]._id}/start`, {
        cookie: studentCookies[track],
        method: "POST",
      });
      assert.equal(start.response.status, 404);
    }
    const legacy = await request(`/quizzes/${quizzes.legacy._id}`, {
      cookie: studentCookies[track],
    });
    assert.equal(legacy.response.status, 404);
  }
});

test("CSV import accepts Excel BOM files and reports empty or malformed content clearly", async () => {
  const csv =
    '\uFEFFquestionText,questionType,optionA,optionB,optionC,optionD,correctAnswer\n"BOM imported question",multiple_choice,Yes,No,,,Yes';
  const imported = await request("/admin/questions/import", {
    cookie: adminCookie,
    method: "POST",
    body: { quizId: String(quizzes.frontend._id), csv },
  });
  assert.equal(imported.response.status, 200);
  assert.equal(imported.data.imported, 1);
  assert.ok(
    await Question.exists({
      quizId: quizzes.frontend._id,
      questionText: "BOM imported question",
    }),
  );

  const empty = await request("/admin/questions/import", {
    cookie: adminCookie,
    method: "POST",
    body: { quizId: String(quizzes.frontend._id), csv: "  " },
  });
  assert.equal(empty.response.status, 400);
  assert.match(empty.data.message, /choose a csv file/i);

  const malformed = await request("/admin/questions/import", {
    cookie: adminCookie,
    method: "POST",
    body: {
      quizId: String(quizzes.frontend._id),
      csv: 'questionText,questionType,correctAnswer\n"unterminated,text,answer',
    },
  });
  assert.equal(malformed.response.status, 400);
  assert.match(malformed.data.message, /format could not be parsed/i);
});

test("CSV import supports Objective and Theory Question ID format safely", async () => {
  const csv = [
    "Question ID,Section,Topic,Question,Option A,Option B,Option C,Option D,Correct Answer,Marks",
    "1,Objective,JavaScript,Which value is true?,Yes,No,Maybe,Never,A,1",
    '2,Theory,Functions,"Write a function that greets a user.",,,,,4',
  ].join("\n");
  const imported = await request("/admin/questions/import", {
    cookie: adminCookie,
    method: "POST",
    body: { quizId: String(quizzes.frontend._id), csv },
  });
  assert.equal(imported.response.status, 200);
  assert.equal(imported.data.imported, 2);
  assert.equal(imported.data.skipped, 0);
  assert.equal(imported.data.requiresManualGrading, 1);
  assert.match(imported.data.warnings[0], /require manual review/i);
  assert.ok(
    await Question.exists({
      quizId: quizzes.frontend._id,
      questionText: "Which value is true?",
      correctAnswer: "Yes",
    }),
  );
  theoryQuestion = await Question.findOne({
    quizId: quizzes.frontend._id,
    questionText: "Write a function that greets a user.",
  });
  assert.ok(theoryQuestion);
  assert.equal(theoryQuestion.questionType, "text");
  assert.equal(theoryQuestion.correctAnswer, "");
  assert.equal(theoryQuestion.requiresManualGrading, true);
  const started = await request(`/quizzes/${quizzes.frontend._id}/start`, {
    cookie: studentCookies.frontend,
    method: "POST",
  });
  assert.equal(started.response.status, 200);
  assert.ok(
    started.data.questions.some(
      (item) => item.questionText === theoryQuestion.questionText,
    ),
  );
});

test("facilitator lists and dashboard metrics are isolated to the assigned track", async () => {
  for (const track of tracks) {
    const cookie = facilitatorCookies[track];
    const [userList, quizList, questionList, resultList, stats] =
      await Promise.all([
        request("/admin/users", { cookie }),
        request("/admin/quizzes", { cookie }),
        request("/admin/questions", { cookie }),
        request("/admin/results", { cookie }),
        request("/admin/stats", { cookie }),
      ]);
    for (const result of [userList, quizList, questionList, resultList, stats])
      assert.equal(result.response.status, 200);
    assert.deepEqual(
      userList.data.users.map((item) => item.track),
      [track],
    );
    assert.deepEqual(
      quizList.data.quizzes.map((item) => item.track),
      [track],
    );
    assert.ok(
      questionList.data.questions.every((item) => item.quizId.track === track),
    );
    assert.ok(
      resultList.data.results.every(
        (item) => item.quizId.track === track && item.userId.track === track,
      ),
    );
    assert.equal(stats.data.stats.students, 1);
    assert.equal(stats.data.stats.quizzes, 1);
    assert.equal(stats.data.stats.attempts, 1);
    assert.equal(stats.data.stats.average, 80);
    assert.equal(stats.data.stats.passRate, 100);
  }

  const allUsers = await request("/admin/users", { cookie: adminCookie });
  const allQuizzes = await request("/admin/quizzes", { cookie: adminCookie });
  const allResults = await request("/admin/results", { cookie: adminCookie });
  assert.equal(allUsers.data.users.length, 9);
  assert.equal(allQuizzes.data.quizzes.length, 4);
  assert.equal(allResults.data.results.length, 3);
});

test("facilitators cannot read or mutate another track's direct records", async () => {
  const cookie = facilitatorCookies.frontend;
  const attempts = await Attempt.find({
    userId: users.backend._id,
    status: "completed",
  });
  const foreignResult = await request(`/results/${attempts[0]._id}`, {
    cookie,
  });
  assert.equal(foreignResult.response.status, 404);

  const foreignStudentUpdate = await request(
    `/admin/users/${users.backend._id}`,
    { cookie, method: "PATCH", body: { isDisabled: true } },
  );
  assert.equal(foreignStudentUpdate.response.status, 404);
  const foreignStudentDelete = await request(
    `/admin/users/${users.backend._id}`,
    { cookie, method: "DELETE" },
  );
  assert.equal(foreignStudentDelete.response.status, 404);
  assert.equal((await User.findById(users.backend._id)).isDisabled, false);

  const foreignQuizEdit = await request(
    `/admin/quizzes/${quizzes.backend._id}`,
    {
      cookie,
      method: "PATCH",
      body: { title: "Hijacked quiz" },
    },
  );
  assert.equal(foreignQuizEdit.response.status, 404);
  const foreignQuizCreateQuestion = await request("/admin/questions", {
    cookie,
    method: "POST",
    body: {
      quizId: String(quizzes.backend._id),
      questionText: "Cross-track write",
      questionType: "text",
      correctAnswer: "answer",
    },
  });
  assert.equal(foreignQuizCreateQuestion.response.status, 404);
  const foreignQuestionEdit = await request(
    `/admin/questions/${questionsByTrack.backend._id}`,
    {
      cookie,
      method: "PUT",
      body: { questionText: "Cross-track edit" },
    },
  );
  assert.equal(foreignQuestionEdit.response.status, 404);
  const foreignQuestionDelete = await request(
    `/admin/questions/${questionsByTrack.backend._id}`,
    { cookie, method: "DELETE" },
  );
  assert.equal(foreignQuestionDelete.response.status, 404);
  assert.equal(
    (await Question.findById(questionsByTrack.backend._id)).questionText,
    "backend question",
  );
  const foreignQuizDeleteResult = await request(
    `/admin/results/${attempts[0]._id}`,
    { cookie, method: "DELETE" },
  );
  assert.equal(foreignQuizDeleteResult.response.status, 404);
});

test("facilitator quiz creation is locked to its assigned track", async () => {
  const created = await request("/admin/quizzes", {
    cookie: facilitatorCookies.frontend,
    method: "POST",
    body: {
      title: "Facilitator quiz",
      description: "Owned by frontend facilitator",
    },
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.quiz.track, "frontend");

  const spoofed = await request("/admin/quizzes", {
    cookie: facilitatorCookies.frontend,
    method: "POST",
    body: {
      title: "Wrong track quiz",
      description: "Should be rejected",
      track: "backend",
    },
  });
  assert.equal(spoofed.response.status, 403);
  const selfReassignment = await request(
    `/admin/users/${users.frontendFacilitator._id}`,
    {
      cookie: facilitatorCookies.frontend,
      method: "PATCH",
      body: { track: "backend" },
    },
  );
  assert.equal(selfReassignment.response.status, 404);
});

test("admin creates quizzes only with valid tracks and can view every track", async () => {
  for (const track of tracks) {
    const created = await request("/admin/quizzes", {
      cookie: adminCookie,
      method: "POST",
      body: { title: `${track} added`, description: "Track quiz", track },
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.data.quiz.track, track);
  }
  for (const track of [undefined, "all", "invalid"]) {
    const body = { title: "Bad quiz", description: "Invalid track" };
    if (track !== undefined) body.track = track;
    const rejected = await request("/admin/quizzes", {
      cookie: adminCookie,
      method: "POST",
      body,
    });
    assert.equal(rejected.response.status, 400);
  }
  const allQuizzes = await request("/admin/quizzes", { cookie: adminCookie });
  assert.equal(allQuizzes.response.status, 200);
  assert.equal(allQuizzes.data.quizzes.length, 8);
  const assignedFacilitator = await request(
    `/admin/users/${users.backendFacilitator._id}`,
    {
      cookie: adminCookie,
      method: "PATCH",
      body: { track: "product" },
    },
  );
  assert.equal(assignedFacilitator.response.status, 200);
  assert.equal(assignedFacilitator.data.user.role, "facilitator");
  assert.equal(assignedFacilitator.data.user.track, "product");
  await request(`/admin/users/${users.backendFacilitator._id}`, {
    cookie: adminCookie,
    method: "PATCH",
    body: { track: "backend" },
  });
});

test("off-track submission is rejected and a valid attempt still scores", async () => {
  const blocked = await request(`/quizzes/${quizzes.backend._id}/submit`, {
    cookie: studentCookies.frontend,
    method: "POST",
    body: {
      attemptId: activeAttempts.frontend,
      answers: [{ questionId: question._id, answer: "Correct" }],
    },
  });
  assert.equal(blocked.response.status, 404);
  assert.equal(
    (await Attempt.findById(activeAttempts.frontend)).status,
    "in_progress",
  );

  const submitted = await request(`/quizzes/${quizzes.frontend._id}/submit`, {
    cookie: studentCookies.frontend,
    method: "POST",
    body: {
      attemptId: activeAttempts.frontend,
      answers: [
        { questionId: question._id, answer: "Correct" },
        {
          questionId: theoryQuestion._id,
          answer: "function greet() { return 'hello'; }",
        },
      ],
    },
  });
  assert.equal(submitted.response.status, 200);
  const result = await request(`/results/${submitted.data.attemptId}`, {
    cookie: studentCookies.frontend,
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.result.correctAnswers, 1);
  assert.equal(result.data.result.percentage, 33);
  assert.equal(result.data.result.pendingReview, 1);
  assert.equal(
    result.data.result.answers.find(
      (item) => String(item.questionId) === String(theoryQuestion._id),
    ).isCorrect,
    null,
  );
  assert.equal(result.data.result.quiz.track, "frontend");
});

test("students cannot assign their own track or spoof it during login", async () => {
  const spoofed = await login("frontend@tracks.test", { track: "backend" });
  assert.equal(spoofed.data.user.track, "frontend");
  const rejected = await request(`/admin/users/${users.frontend._id}`, {
    cookie: studentCookies.frontend,
    method: "PATCH",
    body: { track: "backend" },
  });
  assert.equal(rejected.response.status, 403);
  assert.equal((await User.findById(users.frontend._id)).track, "frontend");
});

test("admins can assign student and legacy quiz tracks; invalid assignments fail", async () => {
  const invalidStudentTrack = await request(
    `/admin/users/${users.unassigned._id}`,
    {
      cookie: adminCookie,
      method: "PATCH",
      body: { track: "design" },
    },
  );
  assert.equal(invalidStudentTrack.response.status, 400);
  const assignedStudent = await request(
    `/admin/users/${users.unassigned._id}`,
    {
      cookie: adminCookie,
      method: "PATCH",
      body: { track: "product" },
    },
  );
  assert.equal(assignedStudent.response.status, 200);
  assert.equal(assignedStudent.data.user.track, "product");

  const activateLegacy = await request(`/admin/quizzes/${quizzes.legacy._id}`, {
    cookie: adminCookie,
    method: "PATCH",
    body: { isActive: true },
  });
  assert.equal(activateLegacy.response.status, 400);
  const assignedQuiz = await request(`/admin/quizzes/${quizzes.legacy._id}`, {
    cookie: adminCookie,
    method: "PATCH",
    body: { track: "backend" },
  });
  assert.equal(assignedQuiz.response.status, 200);
  assert.equal(assignedQuiz.data.quiz.track, "backend");
  const nowVisible = await request(`/quizzes/${quizzes.legacy._id}`, {
    cookie: studentCookies.backend,
  });
  assert.equal(nowVisible.response.status, 200);
});

test("unassigned students are blocked and mismatched legacy results are hidden", async () => {
  const unassigned = await login("missing-track@tracks.test");
  const blocked = await request("/quizzes", { cookie: unassigned.cookie });
  assert.equal(blocked.response.status, 403);
  assert.match(blocked.data.message, /learning track assigned/i);

  const previousAttempt = await Attempt.create({
    userId: users.frontend._id,
    quizId: quizzes.legacy._id,
    score: 1,
    totalQuestions: 1,
    correctAnswers: 1,
    incorrectAnswers: 0,
    unanswered: 0,
    percentage: 100,
    answers: [],
    startedAt: new Date(),
    completedAt: new Date(),
    status: "completed",
  });
  const history = await request(`/results/${previousAttempt._id}`, {
    cookie: studentCookies.frontend,
  });
  assert.equal(history.response.status, 404);
});

test("development student seeding is idempotent and preserves existing accounts", async () => {
  const preservedPasswordHash = "existing-hash-must-not-change";
  await User.create({
    fullName: "Existing Example Account",
    email: "frontend@example.com",
    passwordHash: preservedPasswordHash,
    role: "user",
    isApproved: false,
  });
  const runSeed = () =>
    execFileSync(process.execPath, ["server/seed-students.js"], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, SEED_STUDENT_PASSWORD: password },
      encoding: "utf8",
    });
  assert.match(runSeed(), /Created: 2; existing accounts preserved: 1/);
  assert.match(runSeed(), /Created: 0; existing accounts preserved: 3/);

  const existing = await User.findOne({ email: "frontend@example.com" });
  assert.equal(existing.fullName, "Existing Example Account");
  assert.equal(existing.passwordHash, preservedPasswordHash);
  assert.equal(existing.isApproved, false);
  assert.equal(existing.track, undefined);
  assert.equal(
    (await User.findOne({ email: "backend@example.com" })).track,
    "backend",
  );
  assert.equal(
    (await User.findOne({ email: "product@example.com" })).track,
    "product",
  );
});

test("provided student roster is normalized and mapped to all three tracks", async () => {
  assert.deepEqual(rosterTrackCounts, {
    frontend: 27,
    backend: 28,
    product: 23,
  });
  assert.equal(studentRoster.length, 78);
  assert.equal(new Set(studentRoster.map((item) => item.email)).size, 78);
  assert.ok(
    studentRoster.every((item) => item.email === item.email.toLowerCase()),
  );
  assert.equal(
    studentRoster.find((item) => item.email === "chidinmanwanekezie5@gmail.com")
      .track,
    "product",
  );
});

test("roster seed approves emails, assigns existing students only, and preserves accounts", async () => {
  const assignedUser = await User.create({
    fullName: "Existing Student Name",
    email: "roster-existing@tracks.test",
    passwordHash: "keep-this-password-hash",
    role: "user",
    isApproved: false,
    isDisabled: true,
  });
  const unrelatedRole = await User.create({
    fullName: "Existing Admin Name",
    email: "roster-admin@tracks.test",
    passwordHash: "keep-admin-hash",
    role: "admin",
    isApproved: true,
  });
  const roster = [
    { email: " ROSTER-EXISTING@TRACKS.TEST ", track: "frontend" },
    { email: "roster-pending@tracks.test", track: "backend" },
    { email: "roster-admin@tracks.test", track: "product" },
  ];
  const first = await assignStudentRoster(roster);
  assert.equal(first.approved, 3);
  assert.equal(first.assigned, 1);
  assert.equal(first.pending, 1);
  assert.equal(first.otherRole, 1);
  const second = await assignStudentRoster(roster);
  assert.equal(second.assigned, 0);
  assert.equal(second.alreadyAssigned, 1);

  const savedStudent = await User.findById(assignedUser._id);
  assert.equal(savedStudent.track, "frontend");
  assert.equal(savedStudent.fullName, "Existing Student Name");
  assert.equal(savedStudent.passwordHash, "keep-this-password-hash");
  assert.equal(savedStudent.isApproved, false);
  assert.equal(savedStudent.isDisabled, true);
  assert.equal((await User.findById(unrelatedRole._id)).track, undefined);
  assert.equal(
    await User.exists({ email: "roster-pending@tracks.test" }),
    null,
  );
  assert.ok(
    await ApprovedEmail.exists({ email: "roster-pending@tracks.test" }),
  );
});

test("roster seed rejects invalid tracks and conflicting duplicate email assignments", async () => {
  await assert.rejects(
    assignStudentRoster([
      { email: "conflict@tracks.test", track: "frontend" },
      { email: "CONFLICT@tracks.test", track: "backend" },
    ]),
    /conflicting tracks/i,
  );
  await assert.rejects(
    assignStudentRoster([{ email: "invalid-track@tracks.test", track: "all" }]),
    /invalid email or track/i,
  );
});

test("login returns service unavailable for database errors instead of invalid credentials", async () => {
  const originalFindOne = User.findOne;
  User.findOne = () => {
    throw Object.assign(new Error("temporary database lookup failure"), {
      name: "MongoNetworkError",
    });
  };
  try {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-used@example.test", password }),
    });
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.match(body.message, /database connection unavailable/i);
    const stillRunning = await request("/auth/logout", { method: "POST" });
    assert.equal(stillRunning.response.status, 204);
  } finally {
    User.findOne = originalFindOne;
  }
});
