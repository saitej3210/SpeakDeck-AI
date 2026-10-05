import { useNavigate } from 'react-router-dom';

export default function ModeSelect() {
  const navigate = useNavigate();
  return (
    <div className="center-col fade-up">
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div className="glow-title" style={{ fontSize: 34 }}>Choose your mode</div>
        <div className="subtitle">Two ways to build a presentation</div>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 900 }}>
        <ModeCard
          title="AI Presentation"
          desc="Describe your topic and audience — SpeakDeck AI drafts the full deck, structure, speaker notes and visuals for you."
          cta="Start with AI"
          onClick={() => navigate('/ai/new')}
          accent="#6ee7ff"
        />
        <ModeCard
          title="Manual Presentation"
          desc="Upload an existing PPTX/PDF or build a deck from scratch, with every object addressable by voice."
          cta="Go manual"
          onClick={() => navigate('/manual')}
          accent="#b98bff"
        />
      </div>
    </div>
  );
}

function ModeCard({ title, desc, cta, onClick, accent }: { title: string; desc: string; cta: string; onClick: () => void; accent: string }) {
  return (
    <div
      className="card"
      onClick={onClick}
      style={{
        width: 380, cursor: 'pointer', position: 'relative', overflow: 'hidden',
        transition: 'transform 0.2s ease, border-color 0.2s ease',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-4px)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
    >
      <div style={{ position: 'absolute', top: -60, right: -60, width: 160, height: 160, borderRadius: '50%', background: accent, opacity: 0.12, filter: 'blur(30px)' }} />
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>{title}</div>
      <div style={{ color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.6, minHeight: 80 }}>{desc}</div>
      <button className="btn btn-primary" style={{ marginTop: 20 }}>{cta} →</button>
    </div>
  );
}
