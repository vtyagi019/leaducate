// lib/store.js
// ------------------------------------------------------------------
// This is the "database" for now: a single JSON file on disk.
// Every route in server.js only talks to load()/save() below, so
// swapping this for Postgres/Mongo later means rewriting this file
// only — the routes and the front end don't need to change.
// ------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function seed() {
  const now = Date.now();
  const minsAgo = (m) => now - m * 60000;

  return {
    nextQId: 7,
    nextAId: 100,
    questions: [
      {
        id: 1,
        title: 'RICE vs MoSCoW — which framework should I actually use for prioritization?',
        body: "I have a backlog of 40 feature requests and stakeholders pulling in different directions. RICE feels more data-driven but MoSCoW is faster to run in a workshop. How do experienced PMs decide?",
        subject: 'Prioritization',
        author: 'Rohit K.',
        createdAt: minsAgo(3),
        status: 'open',
        solvedAt: null,
        media: null,
        flags: 0,
        hidden: false,
        answers: []
      },
      {
        id: 2,
        title: "What's the actual difference between a PRD and a user story?",
        body: 'My manager wants both but they feel redundant to me. Where does one end and the other begin?',
        subject: 'Product Management',
        author: 'Priya S.',
        createdAt: minsAgo(7),
        status: 'open',
        solvedAt: null,
        media: null,
        flags: 0,
        hidden: false,
        answers: [
          { id: 1, author: 'Aanya R.', text: 'A PRD is the "why + what" at a feature/initiative level — problem, goals, success metrics, scope. A user story is one slice of that, written from the user\'s point of view ("As a ... I want ... so that ...") so engineering can build and test it.', isBest: false, media: null, flags: 0, hidden: false }
        ]
      },
      {
        id: 3,
        title: 'How do you choose North Star metric vs regular KPIs?',
        body: 'Our team tracks 15 KPIs and nobody agrees on what actually matters week to week.',
        subject: 'Metrics',
        author: 'Meera T.',
        createdAt: minsAgo(14),
        status: 'open',
        solvedAt: null,
        media: null,
        flags: 0,
        hidden: false,
        answers: []
      },
      {
        id: 4,
        title: 'Best structure for running a 30-minute user interview?',
        body: 'Need an intuitive script — not just "ask open questions", an actual flow for a usability/discovery call.',
        subject: 'User Research',
        author: 'Karan V.',
        createdAt: minsAgo(34),
        status: 'solved',
        solvedAt: minsAgo(26),
        media: null,
        flags: 0,
        hidden: false,
        answers: [
          { id: 1, author: 'Aanya R.', text: '5 min warm-up/context, 15 min open-ended "walk me through the last time you..." questions, 5 min reaction to a prototype if you have one, 5 min wrap-up + ask for referrals. Never lead with your solution.', isBest: true, media: null, flags: 0, hidden: false }
        ]
      },
      {
        id: 5,
        title: 'PM vs Product Owner — are these really different roles?',
        body: 'Job postings use them interchangeably but I keep hearing they\'re not the same thing.',
        subject: 'Product Management',
        author: 'Sana I.',
        createdAt: minsAgo(55),
        status: 'solved',
        solvedAt: minsAgo(48),
        media: null,
        flags: 0,
        hidden: false,
        answers: [
          { id: 1, author: 'Priya S.', text: 'PO is a Scrum-specific role focused on backlog/sprint execution. PM is broader — strategy, discovery, roadmap, stakeholders. In small companies one person often does both, which is where the confusion comes from.', isBest: true, media: null, flags: 0, hidden: false }
        ]
      },
      {
        id: 6,
        title: 'How do you measure activation rate for a B2B SaaS onboarding flow?',
        body: 'We have signups but I can\'t tell if our onboarding is actually working or just looks fine on paper.',
        subject: 'Growth',
        author: 'Vaanshit T.',
        createdAt: minsAgo(1),
        status: 'open',
        solvedAt: null,
        media: null,
        flags: 0,
        hidden: false,
        answers: []
      }
    ],
    users: {
      'Aanya R.': { points: 185, asked: 0, answered: 2, skills: ['User Research', 'Metrics', 'Product Management'] },
      'Rohit K.': { points: 40, asked: 3, answered: 1, skills: ['Prioritization'] },
      'Priya S.': { points: 96, asked: 2, answered: 3, skills: ['Product Management', 'Growth'] },
      'Meera T.': { points: 12, asked: 5, answered: 0, skills: ['Metrics'] },
      'Karan V.': { points: 28, asked: 1, answered: 1, skills: ['User Research'] },
      'Sana I.': { points: 8, asked: 2, answered: 0, skills: ['Product Management'] }
    }
  };
}

function ensureDbFile() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(seed(), null, 2));
  }
}

function load() {
  ensureDbFile();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function save(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = { load, save };
