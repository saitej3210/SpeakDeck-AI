import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import os from 'os';
import dotenv from 'dotenv';
import './db/db.js';
import presentationsRouter from './routes/presentations.js';
import nluRouter from './routes/nlu.js';
import sessionsRouter from './routes/sessions.js';
import practiceRouter from './routes/practice.js';
import { aiConfigured } from './services/openaiService.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, aiConfigured: aiConfigured(), time: new Date().toISOString() });
});

app.get('/api/network', (req, res) => {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const list of Object.values(nets)) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
  const frontendPort = process.env.FRONTEND_PORT || 5173;
  res.json({ ips, urls: ips.map(ip => `http://${ip}:${frontendPort}`) });
});

app.use('/api/presentations', presentationsRouter);
app.use('/api/nlu', nluRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/practice', practiceRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`SpeakDeck AI backend listening on http://localhost:${PORT}`);
  if (!aiConfigured()) {
    console.warn('WARNING: GEMINI_API_KEY not set. AI generation, speaker notes, Q&A and LLM-based voice intent parsing will be disabled until you add it to backend/.env');
  }
});
