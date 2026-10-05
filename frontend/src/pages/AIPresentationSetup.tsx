import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../engine/api';

export default function AIPresentationSetup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    topic: '', audience: 'engineering students', slideCount: 10, durationMinutes: 10,
    language: 'English', tone: 'professional', difficulty: 'intermediate',
    designStyle: 'Modern', technicalDepth: 'moderate',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  async function generate() {
    if (!form.topic.trim()) { setError('Please describe your topic.'); return; }
    setLoading(true);
    setError('');
    try {
      const presentation = await api.generate(form);
      navigate(`/editor/${presentation.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '60px 24px' }} className="fade-up">
      <div className="glow-title" style={{ fontSize: 30 }}>AI Presentation</div>
      <p style={{ color: 'var(--text-dim)', marginBottom: 32 }}>
        Describe what you want. SpeakDeck AI will draft the outline, slide content, speaker notes and Q&A on the backend.
      </p>

      <div className="card" style={{ display: 'grid', gap: 18 }}>
        <div>
          <label>Topic</label>
          <textarea rows={3} className="input" placeholder='e.g. "A 15-slide presentation about autonomous vehicles for engineering students"'
            value={form.topic} onChange={(e) => set('topic', e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="Audience"><input className="input" value={form.audience} onChange={(e) => set('audience', e.target.value)} /></Field>
          <Field label="Slide count"><input type="number" min={3} max={40} className="input" value={form.slideCount} onChange={(e) => set('slideCount', Number(e.target.value))} /></Field>
          <Field label="Duration (minutes)"><input type="number" min={2} max={90} className="input" value={form.durationMinutes} onChange={(e) => set('durationMinutes', Number(e.target.value))} /></Field>
          <Field label="Language">
            <select className="input" value={form.language} onChange={(e) => set('language', e.target.value)}>
              <option>English</option><option>Telugu</option><option>Hindi</option>
            </select>
          </Field>
          <Field label="Tone">
            <select className="input" value={form.tone} onChange={(e) => set('tone', e.target.value)}>
              <option>professional</option><option>casual</option><option>enthusiastic</option><option>academic</option>
            </select>
          </Field>
          <Field label="Technical depth">
            <select className="input" value={form.difficulty} onChange={(e) => set('difficulty', e.target.value)}>
              <option>beginner</option><option>intermediate</option><option>advanced</option>
            </select>
          </Field>
          <Field label="Design style">
            <select className="input" value={form.designStyle} onChange={(e) => set('designStyle', e.target.value)}>
              <option>Modern</option><option>Minimal</option><option>Corporate</option><option>Academic</option>
              <option>Technical</option><option>Startup</option><option>Creative</option><option>Dark</option>
            </select>
          </Field>
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}

        <button className="btn btn-primary" onClick={generate} disabled={loading}>
          {loading ? 'Generating with AI…' : 'Generate presentation'}
        </button>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          Requires <code>GEMINI_API_KEY</code> set on the backend. If it's missing you'll see an error here rather than a fake result.
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label>{label}</label>{children}</div>;
}
