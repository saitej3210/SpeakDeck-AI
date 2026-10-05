import type { Presentation } from '../types/presentation';

const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const BASE = import.meta.env.VITE_API_URL || `http://${host}:4000`;

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  return res;
}

export const api = {
  health: () => req('/api/health').then((r) => r.json()),
  network: () => req('/api/network').then((r) => r.json()),

  listPresentations: () => req('/api/presentations').then((r) => r.json()),
  getPresentation: (id: string): Promise<Presentation> => req(`/api/presentations/${id}`).then((r) => r.json()),
  savePresentation: (p: Presentation) => req(`/api/presentations/${p.id}`, { method: 'PUT', body: JSON.stringify(p) }).then((r) => r.json()),
  deletePresentation: (id: string) => req(`/api/presentations/${id}`, { method: 'DELETE' }).then((r) => r.json()),

  generate: (params: any): Promise<Presentation> => req('/api/presentations/generate', { method: 'POST', body: JSON.stringify(params) }).then((r) => r.json()),

  upload: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE}/api/presentations/upload`, { method: 'POST', body: form });
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Upload failed'); }
    return res.json();
  },

  saveVersion: (id: string, label: string) => req(`/api/presentations/${id}/versions`, { method: 'POST', body: JSON.stringify({ label }) }).then((r) => r.json()),
  listVersions: (id: string) => req(`/api/presentations/${id}/versions`).then((r) => r.json()),
  restoreVersion: (id: string, versionId: string): Promise<Presentation> => req(`/api/presentations/${id}/versions/${versionId}/restore`, { method: 'POST' }).then((r) => r.json()),

  generateSpeakerNotes: (id: string, slideId: string) => req(`/api/presentations/${id}/speaker-notes/${slideId}`, { method: 'POST' }).then((r) => r.json()),
  ask: (id: string, question: string) => req(`/api/presentations/${id}/qa`, { method: 'POST', body: JSON.stringify({ question }) }).then((r) => r.json()),

  sendCommand: (payload: {
    presentationId: string; currentSlideId: string; selectedObjectId?: string | null;
    lastObjectId?: string | null; transcript: string;
  }) => req('/api/nlu/command', { method: 'POST', body: JSON.stringify(payload) }).then((r) => r.json()),

  exportUrl: (id: string, kind: 'pptx' | 'pdf' | 'transcript' | 'json') => `${BASE}/api/presentations/${id}/export/${kind}`,

  createSession: (presentationId: string) => req('/api/sessions', { method: 'POST', body: JSON.stringify({ presentationId }) }).then((r) => r.json()),
  getQuestions: (code: string) => req(`/api/sessions/${code}/questions`).then((r) => r.json()),
  askQuestion: (code: string, question: string) => req(`/api/sessions/${code}/questions`, { method: 'POST', body: JSON.stringify({ question }) }).then((r) => r.json()),
  createPoll: (code: string, question: string, options: string[]) => req(`/api/sessions/${code}/polls`, { method: 'POST', body: JSON.stringify({ question, options }) }).then((r) => r.json()),
  getPolls: (code: string) => req(`/api/sessions/${code}/polls`).then((r) => r.json()),
  vote: (code: string, pollId: string, optionIndex: number) => req(`/api/sessions/${code}/polls/${pollId}/vote`, { method: 'POST', body: JSON.stringify({ optionIndex }) }).then((r) => r.json()),

  analyzePractice: (payload: any) => req('/api/practice/analyze', { method: 'POST', body: JSON.stringify(payload) }).then((r) => r.json()),
};

export { BASE };
