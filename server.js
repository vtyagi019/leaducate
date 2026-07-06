// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const store = require('./lib/store');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- media uploads ----------
// Files are saved to disk under /uploads and served statically.
// Swap this storage engine later for S3/Cloudinary if you move to
// a host where the filesystem isn't permanent (e.g. most free PaaS tiers).
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const ALLOWED_TYPES = /^(image|video|audio)\//;
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.test(file.mimetype)) return cb(new Error('Only images, video, or audio files are allowed.'));
    cb(null, true);
  }
});

app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------
function badgeFor(points) {
  if (points >= 350) return 'Legend';
  if (points >= 150) return 'Mentor';
  if (points >= 50) return 'Helper';
  return 'Newcomer';
}

function ensureUser(db, name) {
  if (!db.users[name]) {
    db.users[name] = { points: 0, asked: 0, answered: 0, skills: [] };
  }
  return db.users[name];
}

function publicUser(name, u) {
  return { name, points: u.points, asked: u.asked, answered: u.answered, skills: u.skills, badge: badgeFor(u.points) };
}

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

function mediaTypeFromMime(mime) {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return null;
}

// A piece of content auto-hides once it crosses this many reports.
// This is a stand-in for real AI moderation — wire a service like
// AWS Rekognition / Hive / OpenAI moderation into reportContent()
// below when you have an API key for one.
const AUTO_HIDE_AFTER_FLAGS = 3;

function publicQuestion(q) {
  return {
    ...q,
    answerCount: q.answers.filter(a => !a.hidden).length,
    answers: q.answers.filter(a => !a.hidden)
  };
}

// ---------- auth (placeholder — no passwords yet) ----------
app.post('/api/users/login', (req, res) => {
  const name = (req.body.name || '').trim();
  if (name.length < 2) return fail(res, 400, 'Enter a name with at least 2 characters.');
  const db = store.load();
  const u = ensureUser(db, name);
  store.save(db);
  res.json({ user: publicUser(name, u) });
});

// ---------- media upload ----------
app.post('/api/uploads', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return fail(res, 400, err.message);
    if (!req.file) return fail(res, 400, 'No file received.');
    const type = mediaTypeFromMime(req.file.mimetype);
    res.status(201).json({ url: `/uploads/${req.file.filename}`, type });
  });
});

// ---------- questions / feed ----------
app.get('/api/questions', (req, res) => {
  const db = store.load();
  const { subject, sort } = req.query;

  let list = db.questions.filter(q => !q.hidden);
  const openCountTotal = list.filter(q => q.status === 'open').length;

  const solved = list.filter(q => q.status === 'solved' && q.solvedAt);
  const avgSolveMinutes = solved.length
    ? Math.round(solved.reduce((sum, q) => sum + (q.solvedAt - q.createdAt) / 60000, 0) / solved.length)
    : 0;

  if (subject && subject !== 'All') {
    list = list.filter(q => q.subject === subject);
  }

  list = [...list].sort((a, b) => {
    if (sort === 'new') return b.createdAt - a.createdAt;
    // default: most urgent first — open doubts (oldest first), solved ones pushed last
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return a.createdAt - b.createdAt;
  });

  res.json({
    questions: list.map(publicQuestion),
    openCountTotal,
    avgSolveMinutes
  });
});

// ---------- "similar questions" suggestions ----------
// Simple keyword-overlap scoring — no ML, no external calls, runs instantly.
// Good enough to catch near-duplicate questions before they're posted.
// A future upgrade (real semantic search) would embed each question with
// an embeddings API and compare vectors instead of raw word overlap.
const STOPWORDS = new Set(['the','a','an','is','are','to','of','and','for','in','on','how','what','why','do','does','i','my','can','you','it','this','that','with','be','vs']);
function tokenize(s) {
  return (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 2 && !STOPWORDS.has(w));
}
app.get('/api/questions/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 6) return res.json({ matches: [] });
  const db = store.load();
  const queryWords = new Set(tokenize(q));
  if (queryWords.size === 0) return res.json({ matches: [] });

  const scored = db.questions
    .filter(item => !item.hidden)
    .map(item => {
      const words = tokenize(item.title + ' ' + item.body);
      const overlap = words.filter(w => queryWords.has(w)).length;
      const score = overlap / Math.sqrt(queryWords.size * Math.max(words.length, 1));
      return { item, score };
    })
    .filter(s => s.score > 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(s => ({ id: s.item.id, title: s.item.title, subject: s.item.subject, status: s.item.status, answerCount: s.item.answers.filter(a => !a.hidden).length }));

  res.json({ matches: scored });
});

app.post('/api/questions', (req, res) => {
  const { title = '', body = '', subject = 'Other', author = '', media = null } = req.body;
  if (!author) return fail(res, 401, 'Sign in before posting a doubt.');
  if (title.trim().length < 8) return fail(res, 400, 'Title needs at least 8 characters.');
  if (body.trim().length < 10) return fail(res, 400, 'Add a bit more detail in the description.');

  const db = store.load();
  ensureUser(db, author);
  const q = {
    id: db.nextQId++,
    title: title.trim(),
    body: body.trim(),
    subject,
    author,
    createdAt: Date.now(),
    status: 'open',
    solvedAt: null,
    media: media && media.url ? { url: media.url, type: media.type } : null,
    flags: 0,
    hidden: false,
    answers: []
  };
  db.questions.unshift(q);
  db.users[author].asked++;
  store.save(db);
  res.status(201).json({ question: q });
});

app.get('/api/questions/:id', (req, res) => {
  const db = store.load();
  const q = db.questions.find(q => q.id === Number(req.params.id));
  if (!q || q.hidden) return fail(res, 404, "This doubt doesn't exist (anymore).");
  res.json({ question: publicQuestion(q) });
});

app.post('/api/questions/:id/answers', (req, res) => {
  const { author = '', text = '', media = null } = req.body;
  if (!author) return fail(res, 401, 'Sign in before answering.');
  if (!text.trim() && !(media && media.url)) return fail(res, 400, 'Write something (or attach media) before submitting.');

  const db = store.load();
  const q = db.questions.find(q => q.id === Number(req.params.id));
  if (!q || q.hidden) return fail(res, 404, "This doubt doesn't exist (anymore).");
  if (q.status === 'solved') return fail(res, 400, 'This doubt is already solved.');

  ensureUser(db, author);
  const ans = {
    id: db.nextAId++,
    author,
    text: text.trim(),
    media: media && media.url ? { url: media.url, type: media.type } : null,
    isBest: false,
    flags: 0,
    hidden: false
  };
  q.answers.push(ans);
  db.users[author].answered++;
  db.users[author].points += 5;
  store.save(db);
  res.status(201).json({ question: publicQuestion(q) });
});

app.post('/api/questions/:id/answers/:answerId/best', (req, res) => {
  const { author = '' } = req.body;
  const db = store.load();
  const q = db.questions.find(q => q.id === Number(req.params.id));
  if (!q || q.hidden) return fail(res, 404, "This doubt doesn't exist (anymore).");
  if (q.author !== author) return fail(res, 403, 'Only the person who asked can mark a best answer.');

  const ans = q.answers.find(a => a.id === Number(req.params.answerId));
  if (!ans) return fail(res, 404, 'That answer no longer exists.');

  q.answers.forEach(a => { a.isBest = a.id === ans.id; });
  q.status = 'solved';
  q.solvedAt = Date.now();
  ensureUser(db, ans.author).points += 20;
  store.save(db);
  res.json({ question: publicQuestion(q) });
});

// ---------- reporting / moderation ----------
// Stand-in for AI moderation: enough reports auto-hides the content.
// Replace the body of this handler with a call to a real moderation
// API if/when you have one — everything else stays the same.
app.post('/api/questions/:id/report', (req, res) => {
  const { answerId } = req.body || {};
  const db = store.load();
  const q = db.questions.find(q => q.id === Number(req.params.id));
  if (!q) return fail(res, 404, "This doubt doesn't exist (anymore).");

  const target = answerId ? q.answers.find(a => a.id === Number(answerId)) : q;
  if (!target) return fail(res, 404, 'Nothing to report there.');

  target.flags = (target.flags || 0) + 1;
  if (target.flags >= AUTO_HIDE_AFTER_FLAGS) target.hidden = true;
  store.save(db);
  res.json({ flags: target.flags, hidden: !!target.hidden });
});

// ---------- profile ----------
app.get('/api/users/:name', (req, res) => {
  const name = req.params.name;
  const db = store.load();
  const u = ensureUser(db, name);
  store.save(db);

  const asked = db.questions.filter(q => q.author === name && !q.hidden).map(q => ({ id: q.id, title: q.title, subject: q.subject, status: q.status, createdAt: q.createdAt }));
  const answered = db.questions.filter(q => !q.hidden && q.answers.some(a => a.author === name && !a.hidden)).map(q => ({ id: q.id, title: q.title }));

  res.json({ profile: { ...publicUser(name, u), asked, answered } });
});

// ---------- leaderboard ----------
app.get('/api/leaderboard', (req, res) => {
  const db = store.load();
  const rows = Object.entries(db.users)
    .map(([name, u]) => publicUser(name, u))
    .sort((a, b) => b.points - a.points);
  res.json({ leaderboard: rows });
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
