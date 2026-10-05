import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

// Portable JSON persistence. This intentionally avoids native SQLite modules so
// SpeakDeck runs on Node 20/22/24 without Visual Studio/C++ build tools.
const dbPath = process.env.DB_PATH || './data/speakdeck.json';
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const TABLES = ['presentations','versions','sessions','session_questions','session_polls','practice_reports'];
let state = Object.fromEntries(TABLES.map((t) => [t, []]));

function loadState() {
  try {
    if (fs.existsSync(dbPath)) {
      const parsed = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      state = { ...state, ...parsed };
    }
  } catch (e) {
    console.warn('Could not read persistence file; starting fresh:', e.message);
  }
}
function persist() {
  fs.writeFileSync(dbPath, JSON.stringify(state, null, 2), 'utf8');
}
loadState();

function tableFrom(sql) {
  const m = sql.match(/\b(?:FROM|INTO|UPDATE)\s+([a-zA-Z_][\w]*)/i);
  return m?.[1];
}
function whereParts(sql) {
  const m = sql.match(/\bWHERE\s+(.+?)(?:\s+ORDER BY|\s+LIMIT|$)/i);
  if (!m) return [];
  return m[1].split(/\s+AND\s+/i).map((x) => x.trim()).filter(Boolean);
}
function valueFor(row, field) { return row[field]; }
function matches(row, parts, params) {
  let p = 0;
  for (const part of parts) {
    const m = part.match(/^([\w]+)\s*=\s*\?$/i);
    if (!m) continue;
    if (String(valueFor(row, m[1])) !== String(params[p++])) return false;
  }
  return true;
}
function select(sql, params, one = false) {
  const table = tableFrom(sql);
  const rows = (state[table] || []).filter((r) => matches(r, whereParts(sql), params));
  const order = sql.match(/ORDER BY\s+([\w]+)(?:\s+(ASC|DESC))?/i);
  if (order) {
    const key = order[1], dir = (order[2] || 'ASC').toUpperCase();
    rows.sort((a,b) => String(a[key] ?? '').localeCompare(String(b[key] ?? '')) * (dir === 'DESC' ? -1 : 1));
  }
  let out = rows;
  const fieldsMatch = sql.match(/^\s*SELECT\s+(.+?)\s+FROM/i);
  if (fieldsMatch && fieldsMatch[1].trim() !== '*') {
    const fields = fieldsMatch[1].split(',').map((x) => x.trim()).filter(Boolean);
    out = rows.map((r) => Object.fromEntries(fields.map((f) => [f, r[f]])));
  }
  return one ? (out[0] || undefined) : out;
}

export const db = {
  prepare(sql) {
    return {
      get: (...params) => select(sql, params, true),
      all: (...params) => select(sql, params, false),
      run: (...params) => {
        const trimmed = sql.trim();
        if (/^INSERT\s+INTO/i.test(trimmed)) {
          const table = tableFrom(trimmed);
          const cols = trimmed.match(/^INSERT\s+INTO\s+\w+\s*\(([^)]+)\)/i)?.[1]
            ?.split(',').map((x) => x.trim()) || [];
          const row = Object.fromEntries(cols.map((c, i) => [c, params[i]]));
          state[table].push(row); persist(); return { changes: 1 };
        }
        if (/^UPDATE/i.test(trimmed)) {
          const table = tableFrom(trimmed);
          const setPart = trimmed.match(/\bSET\s+(.+?)\s+WHERE\s+/i)?.[1] || '';
          const sets = setPart.split(',').map((x) => x.trim()).filter(Boolean);
          const where = whereParts(trimmed);
          let pi = 0;
          const setOps = sets.map((s) => { const m = s.match(/^([\w]+)\s*=\s*(\?|[0-9]+|'[^']*')$/); return { field:m?.[1], value:m?.[2] === '?' ? params[pi++] : m?.[2] }; });
          const whereValues = params.slice(pi);
          let changes = 0;
          for (const row of state[table]) {
            if (matches(row, where, whereValues)) {
              setOps.forEach((op) => { if (op.field) row[op.field] = String(op.value).replace(/^'|'$/g,''); });
              changes++;
            }
          }
          persist(); return { changes };
        }
        if (/^DELETE/i.test(trimmed)) {
          const table = tableFrom(trimmed); const before = state[table].length;
          state[table] = state[table].filter((r) => !matches(r, whereParts(trimmed), params));
          persist(); return { changes: before - state[table].length };
        }
        return { changes: 0 };
      },
    };
  },
};
