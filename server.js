// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
require('dotenv').config();
const connectDB = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

let db; // MongoDB connection

// Initialize DB connection
connectDB().then(database => {
  db = database;
  console.log('Database initialized');
}).catch(err => {
  console.error('Failed to connect to database:', err);
  process.exit(1);
});

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
app.post('/api/users/login', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (name.length < 2) return fail(res, 400, 'Enter a name with at least 2 characters.');
    
    let user = await db.collection('users').findOne({ name });
    if (!user) {
      user = { name, points: 0, asked: 0, answered: 0, skills: [] };
      await db.collection('users').insertOne(user);
    }
    res.json({ user: publicUser(name, user) });
  } catch (error) {
    console.error('Login error:', error);
    fail(res, 500, 'Server error');
  }
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
app.get('/api/questions', async (req, res) => {
  try {
    const { subject, sort } = req.query;

    let query = { hidden: false };
    if (subject && subject !== 'All') {
      query.subject = subject;
    }

    let questions = await db.collection('questions').find(query).toArray();
    
    const openCountTotal = questions.filter(q => q.status === 'open').length;

    const solved = questions.filter(q => q.status === 'solved' && q.solvedAt);
    const avgSolveMinutes = solved.length
      ? Math.round(solved.reduce((sum, q) => sum + (q.solvedAt - q.createdAt) / 60000, 0) / solved.length)
      : 0;

    questions = questions.sort((a, b) => {
      if (sort === 'new') return b.createdAt - a.createdAt;
      // default: most urgent first — open doubts (oldest first), solved ones pushed last
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      return a.createdAt - b.createdAt;
    });

    res.json({
      questions: questions.map(publicQuestion),
      openCountTotal,
      avgSolveMinutes
    });
  } catch (error) {
    console.error('Get questions error:', error);
    fail(res, 500, 'Server error');
  }
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
app.get('/api/questions/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 6) return res.json({ matches: [] });
    
    const questions = await db.collection('questions').find({ hidden: false }).toArray();
    const queryWords = new Set(tokenize(q));
    if (queryWords.size === 0) return res.json({ matches: [] });

    const scored = questions
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
  } catch (error) {
    console.error('Search error:', error);
    fail(res, 500, 'Server error');
  }
});

app.post('/api/questions', async (req, res) => {
  try {
    const { title = '', body = '', subject = 'Other', author = '', media = null } = req.body;
    if (!author) return fail(res, 401, 'Sign in before posting a doubt.');
    if (title.trim().length < 8) return fail(res, 400, 'Title needs at least 8 characters.');
    if (body.trim().length < 10) return fail(res, 400, 'Add a bit more detail in the description.');

    // Get next question ID
    const meta = await db.collection('meta').findOne({});
    const nextQId = meta ? meta.nextQId : 1;

    // Ensure user exists
    const user = await db.collection('users').findOne({ name: author });
    if (!user) {
      await db.collection('users').insertOne({ name: author, points: 0, asked: 0, answered: 0, skills: [] });
    }

    const q = {
      id: nextQId,
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

    await db.collection('questions').insertOne(q);
    await db.collection('users').updateOne({ name: author }, { $inc: { asked: 1 } });
    await db.collection('meta').updateOne({}, { $set: { nextQId: nextQId + 1 } }, { upsert: true });

    res.status(201).json({ question: q });
  } catch (error) {
    console.error('Create question error:', error);
    fail(res, 500, 'Server error');
  }
});

app.get('/api/questions/:id', async (req, res) => {
  try {
    const q = await db.collection('questions').findOne({ id: Number(req.params.id) });
    if (!q || q.hidden) return fail(res, 404, "This doubt doesn't exist (anymore).");
    res.json({ question: publicQuestion(q) });
  } catch (error) {
    console.error('Get question error:', error);
    fail(res, 500, 'Server error');
  }
});

app.post('/api/questions/:id/answers', async (req, res) => {
  try {
    const { author = '', text = '', media = null } = req.body;
    if (!author) return fail(res, 401, 'Sign in before answering.');
    if (!text.trim() && !(media && media.url)) return fail(res, 400, 'Write something (or attach media) before submitting.');

    const q = await db.collection('questions').findOne({ id: Number(req.params.id) });
    if (!q || q.hidden) return fail(res, 404, "This doubt doesn't exist (anymore).");
    if (q.status === 'solved') return fail(res, 400, 'This doubt is already solved.');

    // Get next answer ID
    const meta = await db.collection('meta').findOne({});
    const nextAId = meta ? meta.nextAId : 100;

    // Ensure user exists
    const user = await db.collection('users').findOne({ name: author });
    if (!user) {
      await db.collection('users').insertOne({ name: author, points: 0, asked: 0, answered: 0, skills: [] });
    }

    const ans = {
      id: nextAId,
      author,
      text: text.trim(),
      media: media && media.url ? { url: media.url, type: media.type } : null,
      isBest: false,
      flags: 0,
      hidden: false
    };

    await db.collection('questions').updateOne(
      { id: Number(req.params.id) },
      { $push: { answers: ans } }
    );
    await db.collection('users').updateOne(
      { name: author },
      { $inc: { answered: 1, points: 5 } }
    );
    await db.collection('meta').updateOne({}, { $set: { nextAId: nextAId + 1 } }, { upsert: true });

    const updatedQ = await db.collection('questions').findOne({ id: Number(req.params.id) });
    res.status(201).json({ question: publicQuestion(updatedQ) });
  } catch (error) {
    console.error('Create answer error:', error);
    fail(res, 500, 'Server error');
  }
});

app.post('/api/questions/:id/answers/:answerId/best', async (req, res) => {
  try {
    const { author = '' } = req.body;
    const q = await db.collection('questions').findOne({ id: Number(req.params.id) });
    if (!q || q.hidden) return fail(res, 404, "This doubt doesn't exist (anymore).");
    if (q.author !== author) return fail(res, 403, 'Only the person who asked can mark a best answer.');

    const ans = q.answers.find(a => a.id === Number(req.params.answerId));
    if (!ans) return fail(res, 404, 'That answer no longer exists.');

    // Update all answers to set isBest only on the selected one
    const updatedAnswers = q.answers.map(a => ({
      ...a,
      isBest: a.id === ans.id
    }));

    await db.collection('questions').updateOne(
      { id: Number(req.params.id) },
      {
        $set: {
          answers: updatedAnswers,
          status: 'solved',
          solvedAt: Date.now()
        }
      }
    );

    // Add points to answer author
    await db.collection('users').updateOne(
      { name: ans.author },
      { $inc: { points: 20 } }
    );

    const updatedQ = await db.collection('questions').findOne({ id: Number(req.params.id) });
    res.json({ question: publicQuestion(updatedQ) });
  } catch (error) {
    console.error('Mark best answer error:', error);
    fail(res, 500, 'Server error');
  }
});

// ---------- reporting / moderation ----------
// Stand-in for AI moderation: enough reports auto-hides the content.
// Replace the body of this handler with a call to a real moderation
// API if/when you have one — everything else stays the same.
app.post('/api/questions/:id/report', async (req, res) => {
  try {
    const { answerId } = req.body || {};
    const q = await db.collection('questions').findOne({ id: Number(req.params.id) });
    if (!q) return fail(res, 404, "This doubt doesn't exist (anymore).");

    let target = answerId 
      ? q.answers.find(a => a.id === Number(answerId))
      : q;
    
    if (!target) return fail(res, 404, 'Nothing to report there.');

    const newFlags = (target.flags || 0) + 1;
    const willHide = newFlags >= AUTO_HIDE_AFTER_FLAGS;

    if (answerId) {
      // Update specific answer
      const updatedAnswers = q.answers.map(a =>
        a.id === Number(answerId)
          ? { ...a, flags: newFlags, hidden: willHide }
          : a
      );
      await db.collection('questions').updateOne(
        { id: Number(req.params.id) },
        { $set: { answers: updatedAnswers } }
      );
    } else {
      // Update question
      await db.collection('questions').updateOne(
        { id: Number(req.params.id) },
        {
          $set: {
            flags: newFlags,
            hidden: willHide
          }
        }
      );
    }

    res.json({ flags: newFlags, hidden: willHide });
  } catch (error) {
    console.error('Report error:', error);
    fail(res, 500, 'Server error');
  }
});

// ---------- profile ----------
app.get('/api/users/:name', async (req, res) => {
  try {
    const name = req.params.name;
    let user = await db.collection('users').findOne({ name });
    if (!user) {
      user = { name, points: 0, asked: 0, answered: 0, skills: [] };
      await db.collection('users').insertOne(user);
    }

    const asked = await db.collection('questions')
      .find({ author: name, hidden: false })
      .project({ id: 1, title: 1, subject: 1, status: 1, createdAt: 1 })
      .toArray();

    const answeredQuestions = await db.collection('questions')
      .find({ hidden: false, 'answers.author': name, 'answers.hidden': false })
      .project({ id: 1, title: 1 })
      .toArray();

    res.json({ profile: { ...publicUser(name, user), asked, answered: answeredQuestions } });
  } catch (error) {
    console.error('Get profile error:', error);
    fail(res, 500, 'Server error');
  }
});

// ---------- leaderboard ----------
app.get('/api/leaderboard', async (req, res) => {
  try {
    const users = await db.collection('users')
      .find({})
      .sort({ points: -1 })
      .toArray();
    
    const leaderboard = users.map(u => publicUser(u.name, u));
    res.json({ leaderboard });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    fail(res, 500, 'Server error');
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Leaducate backend running on port ${PORT}`);
});
