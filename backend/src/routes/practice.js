import express from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db/db.js';
import { analyzeTranscript } from '../services/practiceService.js';

const router = express.Router();

router.post('/analyze', (req, res) => {
  const report = analyzeTranscript(req.body);
  const id = `rep_${nanoid(8)}`;
  db.prepare('INSERT INTO practice_reports (id, presentation_id, data, created_at) VALUES (?, ?, ?, ?)')
    .run(id, req.body.presentationId || null, JSON.stringify(report), new Date().toISOString());
  res.json({ id, ...report });
});

router.get('/reports/:presentationId', (req, res) => {
  const rows = db.prepare('SELECT * FROM practice_reports WHERE presentation_id = ? ORDER BY created_at DESC').all(req.params.presentationId);
  res.json(rows.map((r) => ({ id: r.id, createdAt: r.created_at, ...JSON.parse(r.data) })));
});

export default router;
