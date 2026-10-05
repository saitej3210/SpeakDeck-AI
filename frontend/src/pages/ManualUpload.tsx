import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../engine/api';

export default function ManualUpload() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(file: File) {
    setLoading(true);
    setError('');
    try {
      const { presentation } = await api.upload(file);
      navigate(`/editor/${presentation.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function makeFromScratch() {
    setLoading(true);
    setError('');
    try {
      // Creating a blank deck locally via the same shape the backend uses,
      // then persisting it, keeps this path fast and offline-friendly.
      const blank = {
        id: `pres_${Math.random().toString(36).slice(2, 12)}`,
        title: 'Untitled Presentation',
        theme: 'Modern Dark',
        meta: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        slides: [{
          id: 'slide_1', index: 1, layout: 'standard', background: '#0b0b0d',
          speakerNotes: '', transition: 'fade',
          objects: [{
            id: 'slide_1_title_01', type: 'title', content: 'Untitled Presentation', data: {},
            style: { x: 60, y: 50, w: 1100, h: 90, rotation: 0, fontSize: 40, bold: true, italic: false, underline: false, color: '#f5f5f7', align: 'left', zIndex: 1, hidden: false, highlighted: false },
          }],
        }],
      };
      await api.savePresentation(blank as any);
      navigate(`/editor/${blank.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '60px 24px' }} className="fade-up">
      <div className="glow-title" style={{ fontSize: 30 }}>Manual Presentation</div>
      <p style={{ color: 'var(--text-dim)', marginBottom: 32 }}>Upload an existing deck, or start a new one from scratch.</p>

      <div style={{ display: 'grid', gap: 20 }}>
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Upload Presentation</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
            Supports .pptx and .pdf. Each slide is parsed into addressable objects (title, text, bullets, images) — not flattened into a single image.
          </div>
          <input ref={fileRef} type="file" accept=".pptx,.pdf" style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={loading}>
            {loading ? 'Parsing…' : 'Choose file'}
          </button>
        </div>

        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Make Presentation</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>Start with a single blank slide and build it up in the editor, by hand or by voice.</div>
          <button className="btn" onClick={makeFromScratch} disabled={loading}>Start from scratch</button>
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
      </div>
    </div>
  );
}
