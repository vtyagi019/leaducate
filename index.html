# Leaducate

Real-time peer doubt-solving — MVP build (login/signup, ask, answer, points, leaderboard, media attachments, basic moderation).

## ⚠️ Updating from an older copy?

This update changed the subject categories (Math/Coding/Physics → Product Management/Prioritization/Metrics/etc.) and added new fields to questions. **Delete the old `data/db.json` file** (if one exists from a previous run) before starting the server again — it will be recreated automatically with the new seed data.

## Run it

```bash
npm install
npm start
```

Then open **http://127.0.0.1:3000**

## Routes

| URL | Page |
|---|---|
| `#/home` | live doubt feed |
| `#/ask` | ask a doubt |
| `#/question/:id` | a question + its answers |
| `#/profile` | your profile, points, badge |
| `#/leaderboard` | top users by points |

## How it's wired

- **`server.js`** — Express, exposes a small REST API under `/api/*` and serves `public/index.html` as the SPA.
- **`lib/store.js`** — the "database": one JSON file (`data/db.json`), auto-created with seed data on first run. Every route only talks to `load()`/`save()` here, so swapping in Postgres/Mongo/MongoDB Atlas later means rewriting **this file only**.
- **`public/index.html`** — the whole front end (HTML/CSS/JS, no build step). Hash routing (`#/question/3`) so each page is shareable and refresh-safe.
- **Auth** is name-only right now (no passwords) — matches the MVP scope.
- **"Real-time"** is 15-second polling, not WebSockets.

## New in this update

- **Logo** in the top bar.
- **Subjects** changed to a Product Management taxonomy (Product Management, Prioritization, Metrics, User Research, Growth, Other) — edit the `SUBJECTS` object in `public/index.html` and the seed data in `lib/store.js` to change these again.
- **Profile page** redesigned (banner + avatar, stat row, tabs for "Your doubts" / "Helped with").
- **"Similar questions" suggestions** — typing a title on the Ask page does a live keyword-overlap search against existing questions (`GET /api/questions/search`) and shows close matches so people don't post duplicates. This is plain keyword scoring, not semantic/AI search — a real upgrade path is embedding each question with an embeddings API and comparing vectors instead.
- **Media attachments** — photo/video on Ask, photo/video/voice-note on answers. Files upload to `POST /api/uploads` (via `multer`) and are saved to an `uploads/` folder created next to `server.js`, served at `/uploads/...`. **This folder is not permanent storage on most free hosting tiers** — if you deploy to Render/Railway free tier, files will be wiped on redeploy/restart. For production, swap the multer disk storage in `server.js` for an S3/Cloudinary upload and store the returned URL instead.
- **Reporting / moderation** — a "Report" button appears on questions/answers you didn't post. After 3 reports, the content auto-hides (`AUTO_HIDE_AFTER_FLAGS` in `server.js`). This is a placeholder for real AI moderation: true automatic scam/inappropriate-video detection needs a third-party moderation API (AWS Rekognition, Hive, OpenAI moderation, etc.) and an API key for one of those — wire the call into the `/api/questions/:id/report` handler (or a new upload-time check) whenever you have a key.

## Points logic (matches the PRD)

- +5 for posting an answer
- +20 bonus when your answer is marked "best"
- Badge: Newcomer (0–49) → Helper (50–149) → Mentor (150–349) → Legend (350+)

## Not included yet (by design — see PRD's "Not Included")

AI tutor, video calls, payments, real authentication, real AI content moderation.
