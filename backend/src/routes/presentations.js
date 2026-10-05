import express from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { db } from '../db/db.js';
import { emptyPresentation, makeSlide } from '../services/objectModel.js';
import { generatePresentationOutline, generateSpeakerNotes, answerFromPresentation, aiConfigured } from '../services/openaiService.js';
import { parsePptx } from '../parsers/pptxParser.js';
import { parsePdf } from '../parsers/pdfParser.js';
import { exportToPptx, exportToPdf, exportTranscript } from '../services/exportService.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
const router = express.Router();

function save(presentation) {
  const now = new Date().toISOString();
  presentation.updatedAt = now;
  const existing = db.prepare('SELECT id FROM presentations WHERE id = ?').get(presentation.id);
  if (existing) {
    db.prepare('UPDATE presentations SET title = ?, data = ?, updated_at = ? WHERE id = ?')
      .run(presentation.title, JSON.stringify(presentation), now, presentation.id);
  } else {
    db.prepare('INSERT INTO presentations (id, title, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(presentation.id, presentation.title, JSON.stringify(presentation), presentation.createdAt || now, now);
  }
}

function load(id) {
  const row = db.prepare('SELECT data FROM presentations WHERE id = ?').get(id);
  return row ? JSON.parse(row.data) : null;
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT id, title, created_at, updated_at FROM presentations ORDER BY updated_at DESC').all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const p = load(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});

router.put('/:id', (req, res) => {
  const p = req.body;
  if (p.id !== req.params.id) return res.status(400).json({ error: 'id mismatch' });
  save(p);
  res.json({ ok: true, updatedAt: p.updatedAt });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM presentations WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM versions WHERE presentation_id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- AI Presentation generation -------------------------------------------------
router.post('/generate', async (req, res) => {
  try {
    if (!aiConfigured()) {
      return res.status(400).json({ error: 'GEMINI_API_KEY is not configured on the backend. Add it to backend/.env to use AI generation.' });
    }
    const outline = await generatePresentationOutline(req.body);
    const presentation = emptyPresentation({ title: outline.title, meta: req.body });
    presentation.slides = outline.slides.map((s, i) => {
      const slide = makeSlide(i + 1, {
        title: s.title,
        bullets: s.bullets || [],
        paragraphs: s.paragraphs || [],
        notes: s.speakerNotes || '',
      });
      slide.suggestedVisual = s.suggestedVisual || '';
      slide.qa = s.qa || [];
      return slide;
    });
    save(presentation);
    res.json(presentation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Upload existing presentation -----------------------------------------------
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const name = req.file.originalname.toLowerCase();
    let parsed;
    if (name.endsWith('.pptx')) parsed = await parsePptx(req.file.buffer);
    else if (name.endsWith('.pdf')) parsed = await parsePdf(req.file.buffer);
    else return res.status(400).json({ error: 'Only .pptx and .pdf are supported in this build.' });

    const presentation = emptyPresentation({ title: req.file.originalname.replace(/\.(pptx|pdf)$/i, '') });
    presentation.slides = parsed.slides.length ? parsed.slides : presentation.slides;
    save(presentation);
    res.json({ presentation, mediaCount: parsed.mediaCount || 0 });
  } catch (err) {
    res.status(500).json({ error: `Failed to parse file: ${err.message}` });
  }
});

// --- Versions ---------------------------------------------------------------------
router.post('/:id/versions', (req, res) => {
  const p = load(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const id = `ver_${nanoid(8)}`;
  db.prepare('INSERT INTO versions (id, presentation_id, label, data, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, p.id, req.body.label || 'Manual save', JSON.stringify(p), new Date().toISOString());
  res.json({ id });
});

router.get('/:id/versions', (req, res) => {
  const rows = db.prepare('SELECT id, label, created_at FROM versions WHERE presentation_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(rows);
});

router.post('/:id/versions/:versionId/restore', (req, res) => {
  const row = db.prepare('SELECT data FROM versions WHERE id = ? AND presentation_id = ?').get(req.params.versionId, req.params.id);
  if (!row) return res.status(404).json({ error: 'Version not found' });
  const restored = JSON.parse(row.data);
  save(restored);
  res.json(restored);
});

// --- Speaker notes ------------------------------------------------------------------
router.post('/:id/speaker-notes/:slideId', async (req, res) => {
  try {
    if (!aiConfigured()) return res.status(400).json({ error: 'GEMINI_API_KEY not configured.' });
    const p = load(req.params.id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    const slide = p.slides.find((s) => s.id === req.params.slideId);
    if (!slide) return res.status(404).json({ error: 'Slide not found' });

    const title = slide.objects.find((o) => o.type === 'title')?.content || '';
    const paragraphs = slide.objects.filter((o) => o.type === 'text').map((o) => o.content);
    const bullets = slide.objects.filter((o) => o.type === 'bullet_list').flatMap((o) => o.data?.items || []);

    const notes = await generateSpeakerNotes({ title, paragraphs, bullets });
    slide.speakerNotes = notes;
    save(p);
    res.json({ speakerNotes: notes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Q&A against presentation content ------------------------------------------------
router.post('/:id/qa', async (req, res) => {
  try {
    if (!aiConfigured()) return res.status(400).json({ error: 'GEMINI_API_KEY not configured.' });
    const p = load(req.params.id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    const knowledgeText = exportTranscript(p);
    const answer = await answerFromPresentation({ question: req.body.question, knowledgeText });
    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Export ------------------------------------------------------------------------
router.get('/:id/export/pptx', async (req, res) => {
  const p = load(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const buffer = await exportToPptx(p);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  res.setHeader('Content-Disposition', `attachment; filename="${p.title.replace(/[^a-z0-9]/gi, '_')}.pptx"`);
  res.send(buffer);
});

router.get('/:id/export/pdf', async (req, res) => {
  const p = load(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const buffer = await exportToPdf(p);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${p.title.replace(/[^a-z0-9]/gi, '_')}.pdf"`);
  res.send(buffer);
});

router.get('/:id/export/transcript', (req, res) => {
  const p = load(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="${p.title.replace(/[^a-z0-9]/gi, '_')}_transcript.txt"`);
  res.send(exportTranscript(p));
});

router.get('/:id/export/json', (req, res) => {
  const p = load(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Content-Disposition', `attachment; filename="${p.title.replace(/[^a-z0-9]/gi, '_')}.json"`);
  res.json(p);
});

export { load, save };
export default router;
