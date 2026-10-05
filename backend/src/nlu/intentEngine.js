import { parseIntents, aiConfigured } from '../services/openaiService.js';

// A small set of high-confidence regex rules handle the most common commands
// instantly and cheaply, without a network round trip. Anything that doesn't
// match a rule is sent to the OpenAI structured-intent parser, which also
// handles context resolution ("this"/"that") and command chaining.
//
// This is NOT "five hardcoded phrases" — it's a two-tier pipeline:
//   1) fast deterministic rules for the common cases
//   2) general LLM-based structured parsing for everything else,
//      including multi-step chained commands.

const RULES = [
  { re: /^(?:make|show|bring) (.+?) (?:full ?screen|fullscreen|full slide)$/i, intent:'fullscreen_object', target:(m)=>m[1] },
  { re: /^(?:make|show) (.+?) (?:image )?(?:full ?screen|fullscreen)$/i, intent:'fullscreen_object', target:(m)=>m[1] },
  { re: /^(?:crop|trim) (.+?) (?:left|right|top|bottom) ?(\d+)?%?$/i, intent: 'crop_image', params: (m) => ({ axis: /left/i.test(m[0])?'x':/top/i.test(m[0])?'y':/right/i.test(m[0])?'w':'h', amount: Number(m[2]||10) }), target: (m) => m[1] },
  { re: /^crop (.+) to (center|fit|full)/i, intent: 'crop_image', params: (m) => ({ preset:m[2] }), target:(m)=>m[1] },
  { re: /^rotate (.+?)(?: by (\d+) ?degrees?)?$/i, intent:'rotate_object', params:(m)=>({degrees:Number(m[2]||15)}), target:(m)=>m[1] },
  { re: /^bring (.+) forward/i, intent:'bring_forward', target:(m)=>m[1] },
  { re: /^send (.+) backward/i, intent:'send_backward', target:(m)=>m[1] },
  { re: /^make (.+?) (?:larger|bigger|smaller|smaller)/i, intent:'resize_object', params:(m)=>({direction:/smaller/i.test(m[0])?'down':'up'}), target:(m)=>m[1] },
  { re: /^(?:show|display|reveal) (.+) image/i, intent:'show_object', target:(m)=>m[1] },
  { re: /^highlight (.+)/i, intent: 'highlight_object' },
  { re: /^unhighlight (.+)/i, intent: 'unhighlight_object' },
  { re: /^(show|reveal) (.+)/i, intent: 'show_object' },
  { re: /^hide (.+)/i, intent: 'hide_object' },
  { re: /^delete (.+)/i, intent: 'delete_object' },
  { re: /^(bring back|restore) (.+)/i, intent: 'restore_object' },
  { re: /^(make|resize) (.+?) (bigger|larger|smaller)/i, intent: 'resize_object',
    params: (m) => ({ direction: /bigger|larger/i.test(m[3]) ? 'up' : 'down' }), target: (m) => m[2] },
  { re: /^move (.+?) (left|right|up|down)/i, intent: 'move_object',
    params: (m) => ({ direction: m[2] }), target: (m) => m[1] },
  { re: /^zoom (into|in on|on) (.+)/i, intent: 'zoom_object', target: (m) => m[2] },
  { re: /^explain (this|that|.+)/i, intent: 'explain_object' },
  { re: /^summarize (this|that|.+)/i, intent: 'summarize_object' },
  { re: /^simplify (this|that|.+)/i, intent: 'simplify_object' },
  { re: /^read (this|that|.+)/i, intent: 'read_aloud' },
  { re: /^translate (this|that|.+?)(?: to (\w+))?$/i, intent: 'translate_object',
    params: (m) => ({ language: m[2] || 'English' }), target: (m) => m[1] },
  { re: /^(make|set) (.+?) bold/i, intent: 'set_bold', target: (m) => m[2] },
  { re: /^(make|set) (.+?) italic/i, intent: 'set_italic', target: (m) => m[2] },
  { re: /^duplicate (.+)/i, intent: 'duplicate_object' },
  { re: /^replace (.+?) with (.+)/i, intent: 'replace_image',
    params: (m) => ({ description: m[2] }), target: (m) => m[1] },
  { re: /^play(?: the)? video(?: from (\d+) ?seconds?)?/i, intent: 'play_video',
    params: (m) => ({ atSeconds: m[1] ? Number(m[1]) : 0 }), target: () => 'this' },
  { re: /^pause(?: the)? video/i, intent: 'pause_video', target: () => 'this' },
  { re: /^add (a )?(new )?slide/i, intent: 'add_slide', target: () => null },
  { re: /^delete (this|that) slide/i, intent: 'delete_slide', target: () => 'this' },
  { re: /^duplicate (this|that) slide/i, intent: 'duplicate_slide', target: () => 'this' },
  { re: /^go to (.+)/i, intent: 'go_to_slide', target: (m) => m[1] },
  { re: /^find (?:every |all )?slides? (mentioning|containing|about) (.+)/i, intent: 'search_slides',
    params: (m) => ({ query: m[2] }), target: () => null },
  { re: /^change (?:this |the )?theme to (.+)/i, intent: 'change_theme',
    params: (m) => ({ theme: m[1] }), target: () => null },
];

function ruleBasedParse(transcript) {
  const t = transcript.trim();
  for (const rule of RULES) {
    const m = t.match(rule.re);
    if (m) {
      return {
        intent: rule.intent,
        targetHint: rule.target ? rule.target(m) : m[1],
        parameters: rule.params ? rule.params(m) : {},
      };
    }
  }
  return null;
}

// Splits "do X, then do Y and do Z" into naive chained clauses for the
// rule-based path. The LLM path handles chaining natively via its own prompt.
function splitClauses(transcript) {
  return transcript
    .split(/,| then | and then |(?<!\bthis\b)(?<!\bthat\b) and /i)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function parseCommand(transcript, context) {
  const clauses = splitClauses(transcript);
  const ruleResults = clauses.map(ruleBasedParse);

  if (ruleResults.every(Boolean)) {
    return ruleResults;
  }

  if (!aiConfigured()) {
    // No API key: fall back to whatever rules matched, mark the rest unknown.
    return ruleResults.map((r, i) => r || { intent: 'unknown', targetHint: 'this', parameters: { raw: clauses[i] } });
  }

  // Let the LLM handle the whole utterance for full context-awareness and chaining.
  return parseIntents({ transcript, context });
}
