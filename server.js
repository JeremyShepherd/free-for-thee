'use strict';
/**
 * Free For Thee — free neighbor board (Athens, GA).
 * Standalone public app: Express + SQLite (built-in node:sqlite).
 * No accounts, no sign-in, no paywall, no tracking.
 *
 * Data lives in data/free-for-thee.db (override with DATA_DIR).
 * Ships EMPTY: no seed posts, no demo content.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'free-for-thee.db');

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('need','offer','free','recommend','note')),
    area TEXT NOT NULL DEFAULT '',
    pay TEXT NOT NULL DEFAULT '',
    urgency TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT 'Neighbor',
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author TEXT NOT NULL DEFAULT 'Neighbor',
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_posts_status_type ON posts(status, type);
  CREATE INDEX IF NOT EXISTS idx_replies_post ON replies(post_id);
`);
db.exec('PRAGMA journal_mode = WAL;');

const TYPES = ['need', 'offer', 'free', 'recommend', 'note'];
const TYPE_LABELS = {
  need: 'Need Help',
  offer: 'I Can Help',
  free: 'Free or For Sale',
  recommend: 'Recommendations',
  note: 'Neighbor Notes',
};

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

function cleanStr(v, max = 500) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function postRow(r) {
  return {
    id: r.id,
    title: r.title,
    type: r.type,
    typeLabel: TYPE_LABELS[r.type] || r.type,
    area: r.area,
    pay: r.pay,
    urgency: r.urgency,
    description: r.description,
    author: r.author,
    status: r.status,
    createdAt: r.created_at,
    replyCount: r.reply_count || 0,
  };
}

/* ---------- API ---------- */

// List posts (newest first). ?type=need&status=open
app.get('/api/posts', (req, res) => {
  const { type, status } = req.query;
  const where = [];
  const params = [];
  if (type && TYPES.includes(type)) { where.push('p.type = ?'); params.push(type); }
  if (status === 'open' || status === 'closed') { where.push('p.status = ?'); params.push(status); }
  const sql = `
    SELECT p.*, (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count
    FROM posts p ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.id DESC`;
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(postRow));
});

// One post + its replies
app.get('/api/posts/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
  const p = db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count
    FROM posts p WHERE p.id = ?`).get(id);
  if (!p) return res.status(404).json({ error: 'not found' });
  const replies = db.prepare(
    'SELECT id, author, body, created_at AS createdAt FROM replies WHERE post_id = ? ORDER BY id ASC'
  ).all(id);
  res.json({ ...postRow(p), replies });
});

// Create a post
app.post('/api/posts', (req, res) => {
  const b = req.body || {};
  const title = cleanStr(b.title, 140);
  const type = TYPES.includes(b.type) ? b.type : 'note';
  if (!title) return res.status(400).json({ error: 'title is required' });
  const row = db.prepare(`
    INSERT INTO posts (title, type, area, pay, urgency, description, author)
    VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`).get(
    title,
    type,
    cleanStr(b.area, 80),
    cleanStr(b.pay, 40),
    cleanStr(b.urgency, 20),
    cleanStr(b.description, 2000),
    cleanStr(b.author, 60) || 'Neighbor'
  );
  res.status(201).json(postRow(row));
});

// Reply to a post
app.post('/api/posts/:id/replies', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
  const p = db.prepare('SELECT id FROM posts WHERE id = ?').get(id);
  if (!p) return res.status(404).json({ error: 'not found' });
  const body = cleanStr((req.body || {}).body, 2000);
  if (!body) return res.status(400).json({ error: 'reply text is required' });
  const row = db.prepare(`
    INSERT INTO replies (post_id, author, body) VALUES (?, ?, ?)
    RETURNING id, author, body, created_at AS createdAt`).get(
    id,
    cleanStr((req.body || {}).author, 60) || 'Neighbor',
    body
  );
  res.status(201).json(row);
});

// Mark a post closed (resolved) or reopen it
app.post('/api/posts/:id/close', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
  const p = db.prepare('SELECT id FROM posts WHERE id = ?').get(id);
  if (!p) return res.status(404).json({ error: 'not found' });
  db.prepare(`UPDATE posts SET status = 'closed', closed_at = datetime('now') WHERE id = ?`).run(id);
  res.json({ ok: true, status: 'closed' });
});

app.post('/api/posts/:id/reopen', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
  const p = db.prepare('SELECT id FROM posts WHERE id = ?').get(id);
  if (!p) return res.status(404).json({ error: 'not found' });
  db.prepare(`UPDATE posts SET status = 'open', closed_at = NULL WHERE id = ?`).run(id);
  res.json({ ok: true, status: 'open' });
});

// Health check (used by the host + verification)
app.get('/api/health', (req, res) => {
  res.json({ ok: true, posts: db.prepare('SELECT COUNT(*) AS n FROM posts').get().n });
});

app.listen(PORT, () => {
  console.log(`Free For Thee listening on port ${PORT}`);
  console.log(`Data: ${DB_PATH}`);
});
