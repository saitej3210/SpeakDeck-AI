const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, last: -1 };

function typeWordToType(word) {
  const w = word.toLowerCase();
  if (/image|picture|photo/.test(w)) return 'image';
  if (/chart|graph/.test(w)) return 'chart';
  if (/diagram/.test(w)) return 'diagram';
  if (/paragraph|text/.test(w)) return 'text';
  if (/bullet/.test(w)) return 'bullet_list';
  if (/title|heading/.test(w)) return 'title';
  if (/video/.test(w)) return 'video';
  if (/audio/.test(w)) return 'audio';
  if (/table/.test(w)) return 'table';
  if (/shape/.test(w)) return 'shape';
  return null;
}

// Resolves a targetHint like "this", "the battery image", "the second paragraph",
// "the diagram" into a concrete object id on the current slide (or elsewhere),
// using presentation state + running context (selected/last-mentioned object).
export function resolveTarget(presentation, slide, hint, context) {
  if (!hint) return null;
  const h = hint.toLowerCase().trim();

  if (h === 'this' || h === 'that' || h === 'it') {
    return context.selectedObjectId || context.lastObjectId || null;
  }

  // ordinal + type, e.g. "the second paragraph", "third bullet"
  const ordMatch = h.match(/(first|second|third|fourth|fifth|sixth|last)\s+(\w+)/);
  if (ordMatch) {
    const type = typeWordToType(ordMatch[2]);
    if (type) {
      const candidates = slide.objects.filter((o) => o.type === type || (type === 'text' && o.type === 'bullet_list'));
      const idx = ORDINALS[ordMatch[1]];
      if (idx === -1) return candidates[candidates.length - 1]?.id || null;
      return candidates[idx - 1]?.id || null;
    }
  }

  // type only, e.g. "the diagram", "the image"
  const typeOnly = typeWordToType(h);
  if (typeOnly) {
    const match = slide.objects.find((o) => o.type === typeOnly);
    if (match) return match.id;
  }

  // content keyword match, e.g. "the battery image", "battery section", "LiDAR"
  const words = h.replace(/^(the|that|this|a|an)\s+/, '').split(/\s+/).filter((w) => w.length > 2);
  let best = null;
  let bestScore = 0;
  for (const obj of slide.objects) {
    const text = [obj.content, ...(obj.data?.items || [])].join(' ').toLowerCase();
    let score = 0;
    for (const w of words) if (text.includes(w)) score++;
    if (score > bestScore) {
      bestScore = score;
      best = obj;
    }
  }
  if (best) return best.id;

  // fall back: search whole presentation for a slide match ("slide about sensors")
  return null;
}

export function resolveSlideTarget(presentation, hint) {
  if (!hint) return null;
  const h = hint.toLowerCase();
  if (h === 'this' || h === 'that') return null; // caller should use currentSlideId
  const numMatch = h.match(/slide (\d+)/);
  if (numMatch) return presentation.slides[Number(numMatch[1]) - 1]?.id || null;

  const keyword = h.replace(/^(the|slide|about|on|where we discussed)\s*/gi, '').trim();
  for (const slide of presentation.slides) {
    const haystacks = [slide.speakerNotes || ''];
    for (const obj of slide.objects) {
      if (typeof obj.content === 'string') haystacks.push(obj.content);
      if (obj.data?.items) haystacks.push(obj.data.items.join(' '));
    }
    if (haystacks.join(' ').toLowerCase().includes(keyword)) return slide.id;
  }
  return null;
}
