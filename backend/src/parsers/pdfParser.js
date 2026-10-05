import pdf from 'pdf-parse';
import { makeObject } from '../services/objectModel.js';

// pdf-parse gives us full text plus a page render callback we can use to
// split content per page. We use the simpler `pagerender` hook to capture
// per-page text, then build one slide per PDF page.
export async function parsePdf(buffer) {
  const pages = [];

  await pdf(buffer, {
    pagerender: async (pageData) => {
      const textContent = await pageData.getTextContent();
      const text = textContent.items.map((i) => i.str).join(' ');
      pages.push(text);
      return text;
    },
  });

  const slides = pages.map((text, i) => {
    const slideIndex = i + 1;
    const clean = text.replace(/\s+/g, ' ').trim();
    const lines = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
    const title = lines[0]?.slice(0, 80) || `Page ${slideIndex}`;
    const body = lines.slice(1);

    const objects = [
      makeObject(slideIndex, 'title', 1, {
        content: title,
        style: { x: 60, y: 50, w: 1100, h: 90, fontSize: 32 },
      }),
    ];

    if (body.length) {
      objects.push(makeObject(slideIndex, 'bullet_list', 2, {
        data: { items: body.slice(0, 8) },
        style: { x: 60, y: 170, w: 1100, h: 30 * Math.min(body.length, 8) + 20, fontSize: 16 },
      }));
    }

    return {
      id: `slide_${slideIndex}`,
      index: slideIndex,
      layout: 'imported',
      background: '#0b0b0d',
      speakerNotes: '',
      transition: 'fade',
      objects,
    };
  });

  return { slides };
}
