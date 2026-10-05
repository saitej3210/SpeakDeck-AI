import { findObject, findSlide, makeSlide, searchSlides } from '../services/objectModel.js';
import { resolveTarget, resolveSlideTarget } from './resolver.js';
import { transformText, aiConfigured } from '../services/openaiService.js';

const TEXT_TRANSFORMS = new Set([
  'explain_object', 'summarize_object', 'simplify_object', 'expand_object',
  'shorten_object', 'rewrite_object', 'translate_object', 'read_aloud',
]);

const OP_BY_INTENT = {
  explain_object: 'explain', summarize_object: 'summarize', simplify_object: 'simplify',
  expand_object: 'expand', shorten_object: 'shorten', rewrite_object: 'rewrite',
  translate_object: 'translate',
};

// Executes one intent against presentation state and returns
// { presentation, log: {intent, targetId, message}, contextUpdate }
export async function applyIntent(presentation, intent, context) {
  const currentSlide = findSlide(presentation, context.currentSlideId) || presentation.slides[0];
  const { intent: name, targetHint, parameters = {} } = intent;

  const log = { intent: name, targetHint, message: '' };

  // Slide-level and presentation-level intents that don't target an object.
  if (name === 'add_slide') {
    const idx = presentation.slides.length + 1;
    presentation.slides.push(makeSlide(idx, { title: 'New Slide' }));
    log.message = `Added slide ${idx}.`;
    return { presentation, log, contextUpdate: { currentSlideId: `slide_${idx}` } };
  }

  if (name === 'delete_slide' || name === 'duplicate_slide' || name === 'go_to_slide') {
    const slideId = targetHint === 'this' || !targetHint
      ? currentSlide.id
      : (resolveSlideTarget(presentation, targetHint) || currentSlide.id);
    const idx = presentation.slides.findIndex((s) => s.id === slideId);
    if (idx === -1) { log.message = 'Could not find that slide.'; return { presentation, log, contextUpdate: {} }; }

    if (name === 'delete_slide') {
      presentation.slides.splice(idx, 1);
      presentation.slides.forEach((s, i) => { s.index = i + 1; });
      log.message = `Deleted slide.`;
      return { presentation, log, contextUpdate: { currentSlideId: presentation.slides[0]?.id } };
    }
    if (name === 'duplicate_slide') {
      const copy = JSON.parse(JSON.stringify(presentation.slides[idx]));
      copy.id = `slide_${presentation.slides.length + 1}`;
      presentation.slides.splice(idx + 1, 0, copy);
      presentation.slides.forEach((s, i) => { s.index = i + 1; });
      log.message = `Duplicated slide.`;
      return { presentation, log, contextUpdate: { currentSlideId: copy.id } };
    }
    log.message = `Went to slide ${idx + 1}.`;
    return { presentation, log, contextUpdate: { currentSlideId: slideId } };
  }

  if (name === 'search_slides') {
    const results = searchSlides(presentation, parameters.query || targetHint || '');
    log.message = `Found ${results.length} matching slide(s): ${results.map((s) => s.id).join(', ') || 'none'}.`;
    return { presentation, log, contextUpdate: {}, searchResults: results.map((s) => s.id) };
  }

  if (name === 'change_theme') {
    presentation.theme = parameters.theme || presentation.theme;
    log.message = `Theme changed to ${presentation.theme}.`;
    return { presentation, log, contextUpdate: {} };
  }

  // Object-level intents: resolve the target on the current slide first.
  const objectId = targetHint === 'this' || targetHint === 'that' || !targetHint
    ? (context.selectedObjectId || context.lastObjectId)
    : resolveTarget(presentation, currentSlide, targetHint, context);

  if (!objectId) {
    log.message = `Could not resolve which object "${targetHint}" refers to.`;
    return { presentation, log, contextUpdate: {} };
  }

  const found = findObject(presentation, objectId);
  if (!found) {
    log.message = `Object ${objectId} no longer exists.`;
    return { presentation, log, contextUpdate: {} };
  }
  const { obj } = found;
  log.objectId = obj.id;

  switch (name) {
    case 'highlight_object': obj.style.highlighted = true; log.message = `Highlighted ${obj.id}.`; break;
    case 'unhighlight_object': obj.style.highlighted = false; log.message = `Unhighlighted ${obj.id}.`; break;
    case 'show_object': obj.style.hidden = false; log.message = `Showed ${obj.id}.`; break;
    case 'hide_object': obj.style.hidden = true; log.message = `Hid ${obj.id}.`; break;
    case 'delete_object': obj.style.hidden = true; obj.style.deleted = true; log.message = `Deleted ${obj.id} (can be restored).`; break;
    case 'restore_object': obj.style.hidden = false; obj.style.deleted = false; log.message = `Restored ${obj.id}.`; break;
    case 'duplicate_object': {
      const copy = JSON.parse(JSON.stringify(obj));
      copy.id = `${obj.id}_copy_${Date.now() % 10000}`;
      copy.style.x += 20; copy.style.y += 20;
      found.slide.objects.push(copy);
      log.message = `Duplicated ${obj.id} as ${copy.id}.`;
      break;
    }
    case 'resize_object': {
      if (parameters.fullscreen || (parameters.direction !== 'down' && obj.type === 'image' && parameters.mode === 'fullscreen')) {
        obj.style.x = 0; obj.style.y = 0; obj.style.w = 1200; obj.style.h = 675; obj.style.zoom = 1; obj.style.zIndex = Math.max(...currentSlide.objects.map(o => o.style.zIndex || 0), 0) + 10;
        log.message = `Expanded ${obj.id} to full-slide view.`;
      } else {
        const factor = parameters.direction === 'down' ? 0.85 : 1.2;
        obj.style.w = Math.min(1200 - obj.style.x, Math.round(obj.style.w * factor));
        obj.style.h = Math.min(675 - obj.style.y, Math.round(obj.style.h * factor));
        log.message = `Resized ${obj.id} (${parameters.direction === 'down' ? 'smaller' : 'larger'}).`;
      }
      break;
    }
    case 'fullscreen_object': obj.style.x = 0; obj.style.y = 0; obj.style.w = 1200; obj.style.h = 675; obj.style.zoom = 1; obj.style.zIndex = Math.max(...currentSlide.objects.map(o => o.style.zIndex || 0), 0) + 10; log.message = `Expanded ${obj.id} to full-slide view.`; break;
    case 'zoom_object': obj.style.zoom = (obj.style.zoom || 1) * 1.5; log.message = `Zoomed into ${obj.id}.`; break;
    case 'move_object': {
      const step = 40;
      const dir = parameters.direction;
      if (dir === 'left') obj.style.x -= step;
      if (dir === 'right') obj.style.x += step;
      if (dir === 'up') obj.style.y -= step;
      if (dir === 'down') obj.style.y += step;
      log.message = `Moved ${obj.id} ${dir}.`;
      break;
    }
    case 'rotate_object': obj.style.rotation = (obj.style.rotation + (parameters.degrees || 15)) % 360; log.message = `Rotated ${obj.id}.`; break;
    case 'bring_forward': obj.style.zIndex += 1; log.message = `Brought ${obj.id} forward.`; break;
    case 'send_backward': obj.style.zIndex = Math.max(0, obj.style.zIndex - 1); log.message = `Sent ${obj.id} backward.`; break;
    case 'set_bold': obj.style.bold = !obj.style.bold; log.message = `Toggled bold on ${obj.id}.`; break;
    case 'set_italic': obj.style.italic = !obj.style.italic; log.message = `Toggled italic on ${obj.id}.`; break;
    case 'set_underline': obj.style.underline = !obj.style.underline; log.message = `Toggled underline on ${obj.id}.`; break;
    case 'set_color': obj.style.color = parameters.color || obj.style.color; log.message = `Changed color of ${obj.id}.`; break;
    case 'set_font_size': obj.style.fontSize = parameters.fontSize || obj.style.fontSize; log.message = `Changed font size of ${obj.id}.`; break;
    case 'set_align': obj.style.align = parameters.align || obj.style.align; log.message = `Changed alignment of ${obj.id}.`; break;
    case 'crop_image': {
      const c = obj.data.crop || { x:0,y:0,w:100,h:100 };
      if (parameters.preset === 'full') obj.data.crop = {x:0,y:0,w:100,h:100};
      else if (parameters.preset === 'center') obj.data.crop = {x:10,y:10,w:80,h:80};
      else if (parameters.preset === 'fit') obj.data.crop = {x:0,y:0,w:100,h:100};
      else if (parameters.axis === 'x') c.x = Math.max(0, Math.min(90, Number(parameters.amount)||10));
      else if (parameters.axis === 'y') c.y = Math.max(0, Math.min(90, Number(parameters.amount)||10));
      else if (parameters.axis === 'w') { c.w = Math.max(10, Math.min(100-c.x, 100-(Number(parameters.amount)||10))); }
      else if (parameters.axis === 'h') { c.h = Math.max(10, Math.min(100-c.y, 100-(Number(parameters.amount)||10))); }
      obj.data.crop = c; log.message = `Cropped ${obj.id}.`; break; };
    case 'replace_image': obj.data.pendingReplacement = parameters.description; log.message = `Marked ${obj.id} for replacement with: ${parameters.description}. (Image generation requires connecting an image-generation API — see README.)`; break;
    case 'change_chart_type': obj.data.chartType = parameters.chartType || obj.data.chartType; log.message = `Changed chart type of ${obj.id}.`; break;
    case 'toggle_chart_labels': obj.data.showLabels = !obj.data.showLabels; log.message = `Toggled labels on ${obj.id}.`; break;
    case 'play_video': obj.data.playback = { state: 'playing', atSeconds: parameters.atSeconds || 0 }; log.message = `Playing ${obj.id}.`; break;
    case 'pause_video': obj.data.playback = { state: 'paused' }; log.message = `Paused ${obj.id}.`; break;
    case 'seek_video': obj.data.playback = { state: obj.data.playback?.state || 'paused', atSeconds: parameters.atSeconds || 0 }; log.message = `Seeked ${obj.id}.`; break;
    case 'play_audio': obj.data.playback = { state: 'playing' }; log.message = `Playing audio ${obj.id}.`; break;
    case 'pause_audio': obj.data.playback = { state: 'paused' }; log.message = `Paused audio ${obj.id}.`; break;
    case 'set_volume': obj.data.volume = parameters.volume; log.message = `Set volume on ${obj.id}.`; break;
    case 'add_animation': obj.data.animation = { type: parameters.type || 'fade-in', order: (obj.data.animation?.order || 0) + 1 }; log.message = `Added animation to ${obj.id}.`; break;
    case 'remove_animation': delete obj.data.animation; log.message = `Removed animation from ${obj.id}.`; break;

    default: {
      if (TEXT_TRANSFORMS.has(name)) {
        if (name === 'read_aloud') {
          log.message = `Reading ${obj.id} aloud (handled client-side via speech synthesis).`;
          break;
        }
        if (!aiConfigured()) {
          log.message = `"${name}" needs GEMINI_API_KEY set on the backend to rewrite text.`;
          break;
        }
        // Note: this makes the handler async-aware; caller awaits applyIntent.
        return transformText({ op: OP_BY_INTENT[name], text: obj.content || (obj.data?.items || []).join('. '), language: parameters.language })
          .then((newText) => {
            if (obj.data?.items) obj.data.items = newText.split(/\.\s*/).filter(Boolean);
            else obj.content = newText;
            log.message = `Applied "${OP_BY_INTENT[name]}" to ${obj.id}.`;
            return { presentation, log, contextUpdate: { lastObjectId: obj.id, selectedObjectId: obj.id } };
          });
      }
      log.message = `Command not recognized ("${name}").`;
    }
  }

  return { presentation, log, contextUpdate: { lastObjectId: obj.id, selectedObjectId: obj.id } };
}
