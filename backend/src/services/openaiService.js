import dotenv from 'dotenv';
dotenv.config();

// Kept under the historical filename so existing imports/routes remain stable.
// The provider is now Gemini and uses the official REST generateContent API.
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export function aiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

async function generateText(system, user, { json = true } = {}) {
  if (!aiConfigured()) throw new Error('GEMINI_API_KEY is not set. Add it to backend/.env to enable AI features.');
  const url = `${API_BASE}/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: json ? { temperature: 0.4, responseMimeType: 'application/json' } : { temperature: 0.5 },
  };
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error?.message || `Gemini request failed (${resp.status})`);
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw new Error('Gemini returned an empty response.');
  return json ? JSON.parse(text.replace(/^```json\s*|```$/g, '').trim()) : text;
}

export async function generatePresentationOutline(params) {
  const { topic, audience = 'general audience', slideCount = 10, durationMinutes = 10, language = 'English', tone = 'professional', difficulty = 'intermediate', designStyle = 'Modern', technicalDepth = 'moderate' } = params;
  const system = `You are SpeakDeck AI, an expert presentation designer and speechwriter. Return ONLY valid JSON. Never invent citations. Create concise, presentation-ready content.`;
  const user = `Create a ${slideCount}-slide presentation about ${topic} for ${audience}. Duration ${durationMinutes} minutes. Language ${language}. Tone ${tone}. Difficulty ${difficulty}; technical depth ${technicalDepth}; design ${designStyle}.
Return exactly: {"title":string,"slides":[{"title":string,"paragraphs":string[],"bullets":string[],"speakerNotes":string,"suggestedVisual":string,"qa":string[],"imagePrompt":string}]}`;
  return generateText(system, user);
}

export async function generateSpeakerNotes({ title, paragraphs, bullets, tone = 'professional' }) {
  const result = await generateText('Write concise, natural speaker notes. Return JSON only as {"notes":string}.', `Title: ${title}\nParagraphs: ${JSON.stringify(paragraphs)}\nBullets: ${JSON.stringify(bullets)}\nTone: ${tone}\nWrite 3-5 spoken sentences.`);
  return result.notes || '';
}

export async function parseIntents({ transcript, context }) {
  const system = `You are the command engine for a presentation editor. Convert the presenter command into JSON only: {"intents":[...]}. Valid intents include highlight_object, unhighlight_object, show_object, hide_object, delete_object, restore_object, resize_object, fullscreen_object, move_object, rotate_object, bring_forward, send_backward, set_bold, set_italic, set_underline, set_color, set_font_size, set_align, read_aloud, explain_object, summarize_object, simplify_object, expand_object, shorten_object, rewrite_object, translate_object, duplicate_object, replace_image, crop_image, zoom_object, change_chart_type, edit_chart_data, toggle_chart_labels, play_video, pause_video, seek_video, play_audio, pause_audio, set_volume, add_animation, remove_animation, reorder_animation, add_slide, delete_slide, duplicate_slide, reorder_slide, go_to_slide, change_theme, change_layout, change_background, search_slides, answer_question, unknown. Each intent has intent,targetHint,parameters. Preserve "this/that/it" exactly as targetHint "this". Support chained commands in order.`;
  const user = `Current slide: ${context.currentSlideId}\nSelected object: ${context.selectedObjectId || 'none'}\nLast object: ${context.lastObjectId || 'none'}\nObjects: ${JSON.stringify(context.slideObjectsSummary || [])}\nCommand: ${transcript}`;
  const result = await generateText(system, user);
  return Array.isArray(result?.intents) ? result.intents : [];
}

export async function transformText({ op, text, language }) {
  const instruction = { explain:'Explain clearly in 2-4 sentences.', summarize:'Summarize in 1-2 sentences.', simplify:'Rewrite in plain language.', expand:'Expand with useful accurate detail.', shorten:'Shorten to the essential sentence.', rewrite:'Rewrite for clarity without changing meaning.', translate:`Translate to ${language || 'English'}.` }[op] || 'Rewrite for clarity.';
  const result = await generateText('You edit presentation text. Return JSON only as {"text":string}.', `${instruction}\nContent: ${text}`);
  return result.text || text;
}

export async function answerFromPresentation({ question, knowledgeText }) {
  const system = 'Answer using only the supplied presentation content. If the answer is not present, say you are not certain from the slides. Return JSON only as {"answer":string}.';
  const result = await generateText(system, `Presentation:\n${knowledgeText.slice(0, 16000)}\n\nQuestion: ${question}`);
  return result.answer || 'I could not find that in the current presentation.';
}
