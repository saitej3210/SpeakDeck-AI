import JSZip from 'jszip';
import { parseStringPromise } from 'xml2js';
import { makeObject } from '../services/objectModel.js';

// Extracts plain text runs from a <p:txBody> node's paragraph array.
function extractParagraphText(paragraph) {
  const runs = paragraph?.['a:r'] || [];
  return runs.map((r) => (r['a:t'] && r['a:t'][0]) || '').join('');
}

export async function parsePptx(buffer) {
  const zip = await JSZip.loadAsync(buffer);

  // Collect slide part names in order (slide1.xml, slide2.xml, ...)
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml/)[1]);
      const nb = Number(b.match(/slide(\d+)\.xml/)[1]);
      return na - nb;
    });

  const mediaFiles = Object.keys(zip.files).filter((f) => /^ppt\/media\//.test(f));

  const slides = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.files[slideFiles[i]].async('string');
    const parsed = await parseStringPromise(xml);
    const slideIndex = i + 1;

    const shapes = parsed?.['p:sld']?.['p:cSld']?.[0]?.['p:spTree']?.[0]?.['p:sp'] || [];
    const pics = parsed?.['p:sld']?.['p:cSld']?.[0]?.['p:spTree']?.[0]?.['p:pic'] || [];

    const objects = [];
    let counter = 1;
    let titleFound = false;
    let yCursor = 170;

    for (const shape of shapes) {
      const paragraphs = shape?.['p:txBody']?.[0]?.['a:p'] || [];
      const texts = paragraphs.map(extractParagraphText).filter((t) => t && t.trim());
      if (!texts.length) continue;

      // Heuristic: the first non-empty text shape on the slide is treated as the title.
      if (!titleFound) {
        objects.push(makeObject(slideIndex, 'title', counter++, {
          content: texts.join(' '),
          style: { x: 60, y: 50, w: 1100, h: 90, fontSize: 38 },
        }));
        titleFound = true;
        continue;
      }

      // Multiple short paragraphs become a bullet list; one long paragraph stays as text.
      if (texts.length > 1) {
        objects.push(makeObject(slideIndex, 'bullet_list', counter++, {
          data: { items: texts },
          style: { x: 60, y: yCursor, w: 1100, h: 30 * texts.length + 20, fontSize: 18 },
        }));
      } else {
        objects.push(makeObject(slideIndex, 'text', counter++, {
          content: texts[0],
          style: { x: 60, y: yCursor, w: 1100, h: 70, fontSize: 18 },
        }));
      }
      yCursor += 90;
    }

    for (const _pic of pics) {
      objects.push(makeObject(slideIndex, 'image', counter++, {
        content: 'Imported image',
        data: { note: 'Original embedded image extracted from the uploaded file; not re-rendered inline in this build.' },
        style: { x: 60, y: yCursor, w: 400, h: 260 },
      }));
      yCursor += 280;
    }

    slides.push({
      id: `slide_${slideIndex}`,
      index: slideIndex,
      layout: 'imported',
      background: '#0b0b0d',
      speakerNotes: '',
      transition: 'fade',
      objects,
    });
  }

  return {
    slides,
    mediaCount: mediaFiles.length,
  };
}
