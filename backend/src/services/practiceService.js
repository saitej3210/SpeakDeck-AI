const FILLER_WORDS = ['um', 'uh', 'like', 'you know', 'so', 'actually', 'basically', 'literally', 'kind of', 'sort of'];

// Computes real, if simple, metrics from a transcript + timing the client
// captured (Web Speech API final transcript, with slide-change timestamps).
// This is honestly scoped: it analyzes the TEXT of what was said and its
// timing, not audio features like pitch or true pause detection (that would
// require raw-audio DSP which is out of scope for this build).
export function analyzeTranscript({ transcript, durationSeconds, slideCount, slideTimestamps = [] }) {
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const minutes = Math.max(durationSeconds / 60, 0.01);
  const wpm = Math.round(wordCount / minutes);

  const lowerText = transcript.toLowerCase();
  const fillerCounts = {};
  let totalFillers = 0;
  for (const fw of FILLER_WORDS) {
    const re = new RegExp(`\\b${fw.replace(' ', '\\s+')}\\b`, 'g');
    const matches = lowerText.match(re) || [];
    if (matches.length) {
      fillerCounts[fw] = matches.length;
      totalFillers += matches.length;
    }
  }

  // Repetition: sentences repeated near-verbatim.
  const sentences = transcript.split(/(?<=[.!?])\s+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const seen = new Map();
  let repeated = 0;
  for (const s of sentences) {
    if (s.length < 8) continue;
    seen.set(s, (seen.get(s) || 0) + 1);
    if (seen.get(s) > 1) repeated++;
  }

  // Slide coverage/timing from client-provided timestamps: [{slideId, enteredAt, leftAt}]
  const timing = slideTimestamps.map((t) => ({
    slideId: t.slideId,
    seconds: Math.max(0, Math.round((t.leftAt - t.enteredAt) / 1000)),
  }));
  const avgPerSlide = timing.length ? timing.reduce((a, b) => a + b.seconds, 0) / timing.length : null;
  const unevenSlides = timing.filter((t) => avgPerSlide && (t.seconds > avgPerSlide * 2 || t.seconds < avgPerSlide * 0.3));

  const feedback = [];
  if (wpm > 170) feedback.push('Your pace looks fast (>170 wpm). Consider slowing down for clarity.');
  else if (wpm < 100) feedback.push('Your pace looks slow (<100 wpm). You may have room to tighten delivery.');
  else feedback.push('Your speaking pace looks in a comfortable range.');

  if (totalFillers > wordCount * 0.02) feedback.push(`Filler words (${totalFillers}) are somewhat frequent relative to length — try pausing silently instead.`);
  if (repeated > 0) feedback.push(`Detected ${repeated} near-repeated sentence(s) — watch for restating the same point.`);
  if (unevenSlides.length) feedback.push(`Uneven timing on ${unevenSlides.length} slide(s) — some ran much longer/shorter than the average.`);
  if (slideCount && timing.length < slideCount) feedback.push(`Only ${timing.length} of ${slideCount} slides were timed — some slides may not have been covered.`);

  return {
    wordCount,
    durationSeconds,
    wpm,
    fillerCounts,
    totalFillers,
    repeatedSentences: repeated,
    slideTiming: timing,
    feedback,
    note: 'These are AI-generated estimates based on the transcript and timestamps captured in your browser, not a scientific speech analysis.',
  };
}
