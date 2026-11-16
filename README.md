# Free For Thee

A free neighbor board for Athens, GA — like Nextdoor, but free. Neighbors post
what they need, anyone replies. No accounts, no sign-in, no fees, no ads, no
tracking.

- Categories: Need Help, I Can Help, Free or For Sale, Recommendations, Neighbor Notes
- Voice-to-post: tap the mic, speak, and the post draft fills itself in
  (browser Web Speech API; typed fallback when the browser has no voice input)
- Smart matching: open Need Help posts are matched to open I Can Help posts by
  shared job words, with "Could help you" / "Needs your help" badges and a
  "Matches for you" filter
- Replies on every post; posts can be marked resolved
- Posts are shared between **all** visitors — storage is server-side SQLite
- Ships empty: zero seed posts. The first post belongs to a real neighbor.

Nothing about any business lives in this app — no business name, phone, or
website anywhere. It is presented as made by "a local neighbor who works with
his hands."

## Run it locally

Requires Node.js 22+ (uses the built-in `node:sqlite` — no native modules).

```bash
npm install
npm start
```

Then open http://localhost:3000. Data is stored in `data/free-for-thee.db`
(override with the `DATA_DIR` env var; `PORT` env var sets the port).

## Put it on the public internet (Render, free tier)

Render's free tier is enough for a neighborhood board. The database needs a
persistent disk, or posts vanish every time the service restarts — `render.yaml`
in this folder already declares one.

Exact steps (about 10 minutes, no code changes):

1. Push this folder to a GitHub repo (public or private, either works).
   ```bash
   git init && git add . && git commit -m "Free For Thee"
   # create an empty repo on github.com, then:
   git remote add origin https://github.com/<you>/free-for-thee.git
   git push -u origin main
   ```
2. Sign up at https://dashboard.render.com (free account, email only).
3. Click **New + → Web Service → Build and deploy from a Git repository**,
   pick the repo.
4. Render reads `render.yaml` and fills everything in: Docker runtime, free
   plan, health check `/api/health`, `DATA_DIR=/app/data`, 1 GB persistent
   disk mounted at `/app/data`.
5. Click **Create Web Service**. First deploy takes a few minutes.
6. Render gives you a public URL like
   `https://free-for-thee.onrender.com`. That is the link to share — anyone
   who opens it can post and reply, no account needed.

Notes:
- Free-tier web services sleep after 15 minutes with no traffic and take
  ~30–60 seconds to wake on the next visit. That is the only free-tier
  catch; the board itself stays free.
- If you ever outgrow the free tier, the same code deploys unchanged on
  Fly.io (`fly launch` + a 1 GB volume) or Railway — `Dockerfile` is included
  for that.

## API

- `GET /api/posts?type=&status=` — list posts, newest first
- `GET /api/posts/:id` — one post with its replies
- `POST /api/posts` — `{title, type, area, pay, urgency, description, author}`
  (`type`: `need | offer | free | recommend | note`)
- `POST /api/posts/:id/replies` — `{author, body}`
- `POST /api/posts/:id/close` / `/reopen`
- `GET /api/health`

## Files

```
server.js            Express + SQLite API + static hosting
public/index.html    Page
public/app.js        Board UI, voice-to-post parsing, smart matching
public/style.css     Styling
Dockerfile           Container build
render.yaml          Render free-tier service + persistent disk
```
