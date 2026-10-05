import { useEffect, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';

import { api } from '../engine/api';
import type {
  Presentation,
  CommandLog,
  SlideObject,
  Slide
} from '../types/presentation';

import SlideCanvas from '../components/SlideCanvas';
import VoiceCommandBar from '../components/VoiceCommandBar';

function readingText(obj: SlideObject) {
  if (obj.type === 'bullet_list') {
    return (obj.data?.items || []).join('. ');
  }

  if (['title', 'subtitle', 'text'].includes(obj.type)) {
    return obj.content || '';
  }

  return '';
}

function wordIndexAtChar(text: string, char: number) {
  const before = text.slice(0, char);
  return (before.match(/\S+/g) || []).length - 1;
}

function normalizeWord(word: string) {
  return word
    .toLowerCase()
    .replace(/[^a-z0-9'’-]/gi, '')
    .replace(/[’]/g, "'");
}

type SpeechToken = {
  objectId: string;
  wordIndex: number;
  word: string;
};

function speechTokens(slide: Slide): SpeechToken[] {
  const out: SpeechToken[] = [];

  for (const obj of slide.objects) {
    if (obj.style.hidden || obj.style.deleted) continue;

    if (['title', 'subtitle', 'text'].includes(obj.type)) {
      const words =
        obj.content.match(
          /[A-Za-z0-9]+(?:['’’-][A-Za-z0-9]+)*/g
        ) || [];

      words.forEach((word, i) => {
        out.push({
          objectId: obj.id,
          wordIndex: i,
          word: normalizeWord(word)
        });
      });
    } else if (obj.type === 'bullet_list') {
      let wi = 0;

      for (const item of obj.data?.items || []) {
        const words =
          String(item).match(
            /[A-Za-z0-9]+(?:['’’-][A-Za-z0-9]+)*/g
          ) || [];

        words.forEach((word) => {
          out.push({
            objectId: obj.id,
            wordIndex: wi++,
            word: normalizeWord(word)
          });
        });
      }
    }
  }

  return out;
}

function findSpeechMatch(
  tokens: SpeechToken[],
  spoken: string[],
  cursor: number
) {
  if (!spoken.length || !tokens.length) return -1;

  const end = Math.min(tokens.length, cursor + 80);

  for (
    let start = Math.max(0, cursor - 2);
    start < end;
    start++
  ) {
    if (tokens[start].word !== spoken[0]) continue;

    let j = 0;

    while (
      j < spoken.length &&
      start + j < tokens.length &&
      tokens[start + j].word === spoken[j]
    ) {
      j++;
    }

    if (
      j >= Math.min(2, spoken.length) ||
      (spoken.length === 1 && j === 1)
    ) {
      return start + j - 1;
    }
  }

  // Slight ASR mismatch / prefix matching
  for (
    let start = Math.max(0, cursor - 2);
    start < end;
    start++
  ) {
    const a = tokens[start].word;
    const b = spoken[0];

    if (
      a &&
      b &&
      (
        a.startsWith(b.slice(0, Math.max(3, b.length - 1))) ||
        b.startsWith(a.slice(0, Math.max(3, a.length - 1)))
      )
    ) {
      return start;
    }
  }

  // Search the entire slide when presenter skips/repeats
  for (let start = 0; start < tokens.length; start++) {
    if (tokens[start].word !== spoken[0]) continue;

    let j = 0;

    while (
      j < spoken.length &&
      start + j < tokens.length &&
      tokens[start + j].word === spoken[j]
    ) {
      j++;
    }

    if (j >= Math.min(3, spoken.length)) {
      return start + j - 1;
    }
  }

  return -1;
}

export default function Presenter() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [p, setP] = useState<Presentation | null>(null);
  const [idx, setIdx] = useState(0);
  const [seconds, setSeconds] = useState(0);

  const [ask, setAsk] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);

  const [session, setSession] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState('');
  const [questions, setQuestions] = useState<any[]>([]);

  const [logs, setLogs] = useState<CommandLog[]>([]);
  const [practice, setPractice] = useState(false);
  const [report, setReport] = useState<any>(null);

  const transcript = useRef('');
  const rec = useRef<any>(null);
  const started = useRef(0);
  const timestamps = useRef<any[]>([]);

  const [reading, setReading] = useState(false);
  const [readingObjectId, setReadingObjectId] =
    useState<string | null>(null);
  const [readingWordIndex, setReadingWordIndex] = useState(-1);
  const [autoRead, setAutoRead] = useState(false);

  const readToken = useRef(0);

  const [liveSpeech, setLiveSpeech] = useState(false);
  const [speechObjectId, setSpeechObjectId] =
    useState<string | null>(null);
  const [speechWordIndex, setSpeechWordIndex] = useState(-1);
  const [speechText, setSpeechText] = useState('');

  const speechCursor = useRef(0);

  // Load presentation
  useEffect(() => {
    if (!id) return;

    api
      .getPresentation(id)
      .then(setP)
      .catch(() => {});
  }, [id]);

  // Presentation timer
  useEffect(() => {
    const t = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);

    return () => clearInterval(t);
  }, []);

  // Audience questions polling
  useEffect(() => {
    if (!session) return;

    const t = setInterval(() => {
      api
        .getQuestions(session)
        .then(setQuestions)
        .catch(() => {});
    }, 1500);

    return () => clearInterval(t);
  }, [session]);

  // Reset speech tracking when slide changes
  useEffect(() => {
    resetLiveSpeech();
  }, [idx]);

  // Cleanup speech synthesis
  useEffect(() => {
    return () => {
      readToken.current++;
      window.speechSynthesis?.cancel();

      try {
        (window as any).speechSynthesis?.cancel();
      } catch {
        // ignore
      }
    };
  }, []);

  if (!p) {
    return (
      <div style={{ padding: 40 }}>
        Loading…
      </div>
    );
  }

  /*
   * IMPORTANT:
   * Create a stable non-null reference after the guard.
   * This fixes:
   * "p is possibly null"
   */
  const presentation = p;
  const slide = presentation.slides[idx];

  function resetLiveSpeech() {
    speechCursor.current = 0;
    setSpeechObjectId(null);
    setSpeechWordIndex(-1);
    setSpeechText('');
  }

  function handleLiveSpeech(
    text: string,
    isFinal: boolean
  ) {
    if (!text.trim()) {
      resetLiveSpeech();
      return;
    }

    setSpeechText(text.trim());

    const tokens = speechTokens(slide);

    const spoken =
      (
        text.match(
          /[A-Za-z0-9]+(?:['’’-][A-Za-z0-9]+)*/g
        ) || []
      )
        .map(normalizeWord)
        .filter(Boolean);

    const hit = findSpeechMatch(
      tokens,
      spoken,
      speechCursor.current
    );

    if (hit >= 0) {
      const token = tokens[hit];

      setSpeechObjectId(token.objectId);
      setSpeechWordIndex(token.wordIndex);

      if (isFinal) {
        speechCursor.current = Math.min(
          tokens.length,
          hit + 1
        );
      }
    }
  }

  function go(n: number) {
    const nextIndex = Math.max(
      0,
      Math.min(
        presentation.slides.length - 1,
        idx + n
      )
    );

    if (nextIndex === idx) return;

    stopReading();
    resetLiveSpeech();

    if (practice) {
      const last = timestamps.current.at(-1);

      if (last) {
        last.leftAt = Date.now();
      }

      timestamps.current.push({
        slideId: presentation.slides[nextIndex].id,
        enteredAt: Date.now(),
        leftAt: Date.now()
      });
    }

    setIdx(nextIndex);

    if (n > 0 && autoRead) {
      setTimeout(
        () =>
          startReading(
            presentation.slides[nextIndex]
          ),
        120
      );
    }
  }

  function startReading(
    targetSlide: Slide = slide
  ) {
    window.speechSynthesis?.cancel();

    readToken.current++;

    const token = readToken.current;

    setReading(true);
    setReadingWordIndex(-1);

    const objects = targetSlide.objects.filter(
      (o) =>
        !o.style.hidden &&
        !o.style.deleted &&
        readingText(o)
    );

    let objectIndex = 0;

    const next = () => {
      if (
        token !== readToken.current ||
        objectIndex >= objects.length
      ) {
        setReading(false);
        setReadingObjectId(null);
        setReadingWordIndex(-1);
        return;
      }

      const obj = objects[objectIndex++];
      const text = readingText(obj);

      setReadingObjectId(obj.id);
      setReadingWordIndex(0);

      const utterance =
        new SpeechSynthesisUtterance(text);

      utterance.rate = 0.95;
      utterance.pitch = 1;

      utterance.onboundary = (event: any) => {
        if (token === readToken.current) {
          setReadingWordIndex(
            wordIndexAtChar(
              text,
              Number(event.charIndex || 0)
            )
          );
        }
      };

      utterance.onend = () => {
        setReadingWordIndex(-1);
        setTimeout(next, 180);
      };

      utterance.onerror = () => {
        next();
      };

      window.speechSynthesis.speak(utterance);
    };

    next();
  }

  function stopReading() {
    readToken.current++;

    window.speechSynthesis?.cancel();

    setReading(false);
    setReadingObjectId(null);
    setReadingWordIndex(-1);
  }

  async function askAI(q: string = ask) {
    if (!q.trim() || !id) return;

    setAsking(true);

    try {
      const response = await api.ask(
        id,
        `Current slide ${idx + 1}: ${q}`
      );

      setAnswer(response.answer);
    } catch (e: any) {
      setAnswer(
        e?.message || 'Unable to get AI response.'
      );
    } finally {
      setAsking(false);
    }
  }

  async function startSession() {
    if (!id) return;

    const response = await api.createSession(id);

    setSession(response.code);

    let origin = window.location.origin;

    try {
      const network = await api.network();

      if (network.urls?.[0]) {
        origin = network.urls[0];
      }
    } catch {
      // fallback to current origin
    }

    const url =
      `${origin}/#/join/${response.code}`;

    setJoinUrl(url);

    setQr(
      await QRCode.toDataURL(url, {
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      })
    );
  }

  async function copy() {
    if (!joinUrl) return;

    await navigator.clipboard?.writeText(joinUrl);
  }

  function togglePractice() {
    if (!practice) {
      transcript.current = '';
      started.current = Date.now();

      timestamps.current = [
        {
          slideId: slide.id,
          enteredAt: Date.now(),
          leftAt: Date.now()
        }
      ];

      const SR =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (SR) {
        const recognition = new SR();

        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          for (
            let i = event.resultIndex;
            i < event.results.length;
            i++
          ) {
            if (event.results[i].isFinal) {
              transcript.current +=
                ' ' +
                event.results[i][0].transcript;
            }
          }
        };

        recognition.start();
        rec.current = recognition;
      }

      setPractice(true);
    } else {
      rec.current?.stop();

      const last = timestamps.current.at(-1);

      if (last) {
        last.leftAt = Date.now();
      }

      api
        .analyzePractice({
          presentationId: id,
          transcript:
            transcript.current ||
            '(no speech captured)',
          durationSeconds: Math.round(
            (Date.now() - started.current) / 1000
          ),
          slideCount: presentation.slides.length,
          slideTimestamps: timestamps.current
        })
        .then(setReport)
        .catch(() => {});

      setPractice(false);
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 360px',
        height: '100vh'
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div
          style={{
            padding: '10px 18px',
            borderBottom:
              '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap'
          }}
        >
          <button
            className="btn btn-ghost"
            onClick={() =>
              navigate(`/editor/${id}`)
            }
          >
            ← Editor
          </button>

          <b>{presentation.title}</b>

          <span className="pill">
            Slide {idx + 1}/
            {presentation.slides.length}
          </span>

          <span className="pill">
            {fmt(seconds)}
          </span>

          <div style={{ flex: 1 }} />

          <button
            className={`btn ${
              practice ? 'btn-danger' : ''
            }`}
            onClick={togglePractice}
          >
            {practice
              ? '■ Stop practice'
              : '● Practice'}
          </button>

          <button
            className={`btn ${
              reading
                ? 'btn-danger'
                : 'btn-primary'
            }`}
            onClick={() =>
              reading
                ? stopReading()
                : startReading()
            }
          >
            {reading
              ? '⏹ Stop reading'
              : '🔊 Read slide'}
          </button>

          <button
            className={`btn ${
              autoRead
                ? 'btn-primary'
                : ''
            }`}
            onClick={() =>
              setAutoRead((v) => !v)
            }
          >
            Auto-read {autoRead ? 'ON' : 'OFF'}
          </button>

          {liveSpeech && (
            <span className="pill on">
              🗣️ Live word tracking
            </span>
          )}
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}
        >
          <SlideCanvas
            slide={slide}
            selectedObjectId={null}
            onSelect={() => {}}
            scale={0.9}
            readOnly
            readingObjectId={
              liveSpeech
                ? speechObjectId
                : readingObjectId
            }
            readingWordIndex={
              liveSpeech
                ? speechWordIndex
                : readingWordIndex
            }
          />
        </div>

        <div
          style={{
            padding: '0 16px 10px'
          }}
        >
          {liveSpeech && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-dim)',
                padding: '0 4px 6px'
              }}
            >
              Live transcript:{' '}
              <b
                style={{
                  color: 'var(--text)'
                }}
              >
                {speechText ||
                  'start speaking…'}
              </b>
            </div>
          )}

          <VoiceCommandBar
            presentation={presentation}
            currentSlideId={slide.id}
            selectedObjectId={null}
            onUpdate={setP}
            onLogs={setLogs}
            liveHighlight={liveSpeech}
            onLiveHighlightChange={
              setLiveSpeech
            }
            onSpeech={handleLiveSpeech}
            onContext={(context) => {
              const slideIndex =
                presentation.slides.findIndex(
                  (s) =>
                    s.id ===
                    context.currentSlideId
                );

              if (slideIndex >= 0) {
                setIdx(slideIndex);
              }
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 10,
            padding: 12
          }}
        >
          <button
            className="btn"
            onClick={() => go(-1)}
            disabled={idx === 0}
          >
            ← Prev
          </button>

          <button
            className="btn btn-primary"
            onClick={() => go(1)}
            disabled={
              idx ===
              presentation.slides.length - 1
            }
          >
            Next →
          </button>
        </div>

        {report && (
          <div
            className="card"
            style={{
              margin: '0 16px 16px'
            }}
          >
            <b>Practice report</b>

            <div
              style={{
                fontSize: 12,
                color: 'var(--text-dim)',
                marginTop: 5
              }}
            >
              {report.wordCount} words ·{' '}
              {report.wpm} wpm ·{' '}
              {report.totalFillers} filler
              words ·{' '}
              {report.repeatedSentences}{' '}
              repeats
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          borderLeft:
            '1px solid var(--border)',
          padding: 16,
          overflowY: 'auto'
        }}
      >
        <Section title="Next slide">
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-dim)'
            }}
          >
            {presentation.slides[idx + 1]
              ?.objects.find(
                (o) => o.type === 'title'
              )?.content ||
              'End of presentation'}
          </div>
        </Section>

        <Section title="Speaker notes">
          <div
            style={{
              fontSize: 13,
              whiteSpace: 'pre-wrap'
            }}
          >
            {slide.speakerNotes ||
              '(no notes)'}
          </div>
        </Section>

        <Section title="AI co-presenter">
          <div
            style={{
              display: 'flex',
              gap: 5,
              flexWrap: 'wrap',
              marginBottom: 8
            }}
          >
            {[
              'What should I say next?',
              'Give me a 10-second explanation',
              'Explain this simply',
              'Explain this technically'
            ].map((question) => (
              <button
                className="btn"
                key={question}
                style={{ fontSize: 10 }}
                onClick={() => {
                  setAsk(question);
                  askAI(question);
                }}
              >
                {question}
              </button>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              gap: 6
            }}
          >
            <input
              className="input"
              value={ask}
              onChange={(e) =>
                setAsk(e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  askAI();
                }
              }}
              placeholder="Ask about this slide…"
            />

            <button
              className="btn btn-primary"
              onClick={() => askAI()}
            >
              {asking ? '…' : 'Ask'}
            </button>
          </div>

          {answer && (
            <div
              style={{
                fontSize: 12,
                marginTop: 8,
                color: 'var(--text-dim)'
              }}
            >
              {answer}
            </div>
          )}
        </Section>

        <Section title="Live audience">
          {!session ? (
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={startSession}
            >
              Start audience + QR
            </button>
          ) : (
            <div>
              {qr && (
                <img
                  src={qr}
                  alt="Audience QR"
                  style={{
                    width: '100%',
                    background: '#fff',
                    padding: 8,
                    borderRadius: 10
                  }}
                />
              )}

              <div
                style={{
                  textAlign: 'center',
                  fontSize: 26,
                  fontWeight: 800,
                  letterSpacing: 5,
                  margin: '8px 0'
                }}
              >
                {session}
              </div>

              <button
                className="btn"
                style={{
                  width: '100%',
                  marginBottom: 8
                }}
                onClick={copy}
              >
                Copy join link
              </button>

              <div
                style={{
                  fontSize: 10,
                  color: 'var(--text-dim)',
                  marginBottom: 8
                }}
              >
                Use the LAN URL in the QR,
                not localhost. If a phone
                cannot connect, allow
                Node/Vite through Windows
                Firewall and keep both devices
                on the same Wi-Fi.
              </div>

              <b style={{ fontSize: 12 }}>
                Questions ({questions.length})
              </b>

              {questions.map((question) => (
                <div
                  key={question.id}
                  style={{
                    fontSize: 12,
                    padding: '7px 0',
                    borderBottom:
                      '1px solid var(--border)'
                  }}
                >
                  {question.question}
                </div>
              ))}
            </div>
          )}
        </Section>

        {logs.length > 0 && (
          <Section title="Voice activity">
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-dim)'
              }}
            >
              {logs.slice(-8).map(
                (log, index) => (
                  <div key={index}>
                    → {log.message}
                  </div>
                )
              )}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function fmt(s: number) {
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, '0')}:${(s % 60)
    .toString()
    .padStart(2, '0')}`;
}

function Section({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          fontWeight: 700,
          fontSize: 12,
          marginBottom: 8,
          color: 'var(--text-dim)',
          textTransform: 'uppercase'
        }}
      >
        {title}
      </div>

      {children}
    </div>
  );
}