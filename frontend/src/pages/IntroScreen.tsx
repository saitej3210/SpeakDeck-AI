import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const PARTICLE_COUNT = 40;

export default function IntroScreen() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<'black' | 'reveal' | 'done'>('black');

  const particles = useMemo(
    () => Array.from({ length: PARTICLE_COUNT }, () => ({
      left: Math.random() * 100,
      size: 1 + Math.random() * 3,
      delay: Math.random() * 4,
      duration: 6 + Math.random() * 6,
    })),
    []
  );

  useEffect(() => {
    const t1 = setTimeout(() => setStage('reveal'), 1200);
    const t2 = setTimeout(() => setStage('done'), 7800);
    const t3 = setTimeout(() => navigate('/select'), 8600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [navigate]);

  return (
    <div
      onClick={() => navigate('/select')}
      style={{
        position: 'fixed', inset: 0, background: '#000', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            bottom: '-10%',
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(110,231,255,0.9), rgba(110,231,255,0))',
            animation: `particleDrift ${p.duration}s linear ${p.delay}s infinite`,
          }}
        />
      ))}

      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(circle at 50% 50%, rgba(110,231,255,0.08), transparent 55%)',
          opacity: stage === 'black' ? 0 : 1,
          transition: 'opacity 2.5s ease',
        }}
      />

      <div
        style={{
          position: 'relative', textAlign: 'center',
          opacity: stage === 'black' ? 0 : 1,
          transform: stage === 'black' ? 'scale(0.92)' : 'scale(1)',
          filter: stage === 'black' ? 'blur(12px)' : 'blur(0px)',
          transition: 'opacity 2.2s ease, transform 2.2s ease, filter 2.2s ease',
        }}
      >
        <div
          style={{
            fontSize: 64, fontWeight: 800, letterSpacing: '-0.03em',
            background: 'linear-gradient(135deg, #ffffff 10%, #6ee7ff 55%, #b98bff 100%)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            textShadow: '0 0 80px rgba(110,231,255,0.25)',
          }}
        >
          SPEAKDECK <span style={{ fontWeight: 300 }}>AI</span>
        </div>
        <div style={{ marginTop: 14, letterSpacing: '0.35em', color: '#8f8f9a', fontSize: 13 }}>
          BY KODI SAITEJA
        </div>
        <div
          style={{
            marginTop: 40, fontSize: 12, color: '#55555f', letterSpacing: '0.2em',
            opacity: stage === 'done' ? 1 : 0, transition: 'opacity 1s ease',
          }}
        >
          TAP ANYWHERE TO CONTINUE
        </div>
      </div>
    </div>
  );
}
