import express from 'express';
import { load, save } from './presentations.js';
import { parseCommand } from '../nlu/intentEngine.js';
import { applyIntent } from '../nlu/actions.js';

const router = express.Router();

// POST /api/nlu/command
// body: { presentationId, currentSlideId, selectedObjectId, lastObjectId, transcript }
router.post('/command', async (req, res) => {
  try {
    const { presentationId, currentSlideId, selectedObjectId, lastObjectId, transcript } = req.body;
    if (!transcript || !presentationId) return res.status(400).json({ error: 'presentationId and transcript are required' });

    let presentation = load(presentationId);
    if (!presentation) return res.status(404).json({ error: 'Presentation not found' });

    const slide = presentation.slides.find((s) => s.id === currentSlideId) || presentation.slides[0];
    const slideObjectsSummary = slide.objects.map((o) => ({ id: o.id, type: o.type, content: (o.content || (o.data?.items || []).join(' ')).slice(0, 80) }));

    let context = { currentSlideId: slide.id, selectedObjectId, lastObjectId, slideObjectsSummary };

    const intents = await parseCommand(transcript, context);
    const logs = [];
    let searchResults = null;

    for (const intent of intents) {
      const result = await applyIntent(presentation, intent, context);
      presentation = result.presentation;
      logs.push(result.log);
      context = { ...context, ...result.contextUpdate };
      if (result.searchResults) searchResults = result.searchResults;
    }

    save(presentation);
    res.json({ presentation, logs, context, searchResults });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
