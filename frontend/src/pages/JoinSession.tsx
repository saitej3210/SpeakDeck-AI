import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../engine/api';

export default function JoinSession() {
  const { code } = useParams();
  const [question, setQuestion] = useState('');
  const [sent, setSent] = useState(false);
  const [polls, setPolls] = useState<any[]>([]);
  const [votedIds, setVotedIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => api.getPolls(code).then(setPolls).catch(() => {}), 3000);
    api.getPolls(code).then(setPolls).catch(() => {});
    return () => clearInterval(t);
  }, [code]);

  async function submit() {
    if (!code || !question.trim()) return;
    try {
      await api.askQuestion(code, question);
      setSent(true);
      setQuestion('');
      setTimeout(() => setSent(false), 2500);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function vote(pollId: string, optionIndex: number) {
    if (!code || votedIds.includes(pollId)) return;
    await api.vote(code, pollId, optionIndex);
    setVotedIds((v) => [...v, pollId]);
    api.getPolls(code).then(setPolls);
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 20px' }}>
      <div className="glow-title" style={{ fontSize: 26 }}>You're connected</div>
      <div style={{ color: 'var(--text-dim)', marginBottom: 24, fontSize: 13 }}>Session {code}</div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Ask a question</div>
        <textarea className="input" rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What would you like to ask the presenter?" />
        <button className="btn btn-primary" style={{ marginTop: 10, width: '100%' }} onClick={submit}>Send</button>
        {sent && <div style={{ color: 'var(--success)', fontSize: 12, marginTop: 8 }}>Sent!</div>}
        {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{error}</div>}
      </div>

      {polls.map((poll) => (
        <div className="card" key={poll.id} style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>{poll.question}</div>
          {poll.options.map((opt: string, i: number) => (
            <button key={i} className="btn" style={{ width: '100%', marginBottom: 6, textAlign: 'left' }}
              disabled={votedIds.includes(poll.id)} onClick={() => vote(poll.id, i)}>
              {opt} {votedIds.includes(poll.id) ? `— ${poll.votes[i]} vote(s)` : ''}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
