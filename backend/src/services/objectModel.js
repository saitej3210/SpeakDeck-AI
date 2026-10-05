import { nanoid } from 'nanoid';

// Every object on every slide gets a stable, addressable id of the form:
//   slide_<n>_<type>_<counter>
// e.g. slide_5_title_01, slide_5_text_02, slide_5_image_01

export function objectId(slideIndex, type, counter) {
  const c = String(counter).padStart(2, '0');
  return `slide_${slideIndex}_${type}_${c}`;
}

export function makeObject(slideIndex, type, counter, overrides = {}) {
  return {
    id: objectId(slideIndex, type, counter),
    type, // title | subtitle | text | bullet_list | image | chart | diagram | shape | video | audio | table
    content: overrides.content ?? '',
    data: overrides.data ?? {},
    style: {
      x: overrides.style?.x ?? 40,
      y: overrides.style?.y ?? 40,
      w: overrides.style?.w ?? 400,
      h: overrides.style?.h ?? 100,
      rotation: 0,
      fontSize: overrides.style?.fontSize ?? (type === 'title' ? 34 : 18),
      bold: type === 'title',
      italic: false,
      underline: false,
      color: '#f5f5f7',
      align: 'left',
      zIndex: counter,
      hidden: false,
      highlighted: false,
      ...overrides.style,
    },
  };
}

export function makeSlide(index, { title, bullets = [], paragraphs = [], notes = '' } = {}) {
  const objects = [];
  let counter = 1;

  if (title) {
    objects.push(makeObject(index, 'title', counter++, {
      content: title,
      style: { x: 60, y: 50, w: 1100, h: 90, fontSize: 40 },
    }));
  }

  paragraphs.forEach((p, i) => {
    objects.push(makeObject(index, 'text', counter++, {
      content: p,
      style: { x: 60, y: 170 + i * 90, w: 1100, h: 80, fontSize: 20 },
    }));
  });

  if (bullets.length) {
    objects.push(makeObject(index, 'bullet_list', counter++, {
      content: '',
      data: { items: bullets },
      style: { x: 60, y: 170 + paragraphs.length * 90, w: 1100, h: 40 * bullets.length + 20, fontSize: 20 },
    }));
  }

  return {
    id: `slide_${index}`,
    index,
    layout: 'standard',
    background: '#0b0b0d',
    speakerNotes: notes,
    transition: 'fade',
    objects,
  };
}

export function emptyPresentation({ title = 'Untitled Presentation', theme = 'Modern Dark', meta = {} } = {}) {
  const now = new Date().toISOString();
  return {
    id: `pres_${nanoid(10)}`,
    title,
    theme,
    meta,
    createdAt: now,
    updatedAt: now,
    slides: [makeSlide(1, { title: title, paragraphs: ['Click here to start editing, or use a voice command.'] })],
  };
}

// Finds an object anywhere in the presentation by id.
export function findObject(presentation, objectId) {
  for (const slide of presentation.slides) {
    const obj = slide.objects.find((o) => o.id === objectId);
    if (obj) return { slide, obj };
  }
  return null;
}

export function findSlide(presentation, slideId) {
  return presentation.slides.find((s) => s.id === slideId) || null;
}

// Very small full-text semantic search across slide titles/text/bullets/notes.
export function searchSlides(presentation, query) {
  const q = query.toLowerCase();
  const results = [];
  for (const slide of presentation.slides) {
    const haystacks = [slide.speakerNotes || ''];
    for (const obj of slide.objects) {
      if (typeof obj.content === 'string') haystacks.push(obj.content);
      if (obj.data?.items) haystacks.push(obj.data.items.join(' '));
    }
    const text = haystacks.join(' ').toLowerCase();
    if (text.includes(q)) results.push(slide);
  }
  return results;
}
