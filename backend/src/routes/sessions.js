import express from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db/db.js';

const router = express.Router();

function genCode() {
  return nanoid(6).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
}

// Creates a session for a presentation. The audience joins via /join/:code on
// the frontend (rendered as a QR code client-side from that URL). This is a
// polling-based implementation: the presenter dashboard polls GET endpoints
// every few seconds. It is NOT a websocket/WebRTC real-time push system —
// see FEATURES.md for that limitation.
router.post('/', (req, res) => {
  const code = genCode();
  db.prepare('INSERT INTO sessions (code, presentation_id, created_at) VALUES (?, ?, ?)')
    .run(code, req.body.presentationId, new Date().toISOString());
  res.json({ code });
});

router.get('/:code', (req, res) => {
  const s = db.prepare('SELECT * FROM sessions WHERE code = ?').get(req.params.code);
  if (!s) return res.status(404).json({ error: 'Session not found' });
  res.json(s);
});

router.post('/:code/questions', (req, res) => {
  const id = `q_${nanoid(8)}`;
  db.prepare('INSERT INTO session_questions (id, session_code, question, created_at) VALUES (?, ?, ?, ?)')
    .run(id, req.params.code, req.body.question, new Date().toISOString());
  res.json({ id });
});

router.get('/:code/questions', (req, res) => {
  const rows = db.prepare('SELECT * FROM session_questions WHERE session_code = ? ORDER BY created_at DESC').all(req.params.code);
  res.json(rows);
});

router.post('/:code/questions/:id/answer', (req, res) => {
  db.prepare('UPDATE session_questions SET answer = ?, answered = 1 WHERE id = ?').run(req.body.answer, req.params.id);
  res.json({ ok: true });
});

router.post('/:code/polls', (req, res) => {
  const id = `poll_${nanoid(8)}`;
  const options = req.body.options || [];
  const votes = options.map(() => 0);
  db.prepare('INSERT INTO session_polls (id, session_code, question, options, votes, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.params.code, req.body.question, JSON.stringify(options), JSON.stringify(votes), new Date().toISOString());
  res.json({ id });
});

router.get('/:code/polls', (req, res) => {
  const rows = db.prepare('SELECT * FROM session_polls WHERE session_code = ? ORDER BY created_at DESC').all(req.params.code);
  res.json(rows.map((r) => ({ ...r, options: JSON.parse(r.options), votes: JSON.parse(r.votes) })));
});

router.post('/:code/polls/:id/vote', (req, res) => {
  const row = db.prepare('SELECT * FROM session_polls WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Poll not found' });
  const votes = JSON.parse(row.votes);
  const idx = req.body.optionIndex;
  if (idx >= 0 && idx < votes.length) votes[idx]++;
  db.prepare('UPDATE session_polls SET votes = ? WHERE id = ?').run(JSON.stringify(votes), req.params.id);
  res.json({ votes });
});

export default router;
