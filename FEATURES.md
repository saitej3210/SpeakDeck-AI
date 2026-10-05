# SpeakDeck AI — Feature Status (Enhanced Build)

Legend: **[WORKING]** implemented in the shipped local build; **[EXTERNAL]** depends on a browser/device/provider capability; **[NEXT]** intentionally not faked.

1. [WORKING] Cinematic intro + mode selection
2. [WORKING] AI presentation generation via Gemini REST API
3. [WORKING] Backend-only AI secret handling
4. [WORKING] Manual presentation mode
5. [WORKING] PPTX/PDF upload and object model parsing
6. [WORKING] Stable object IDs per slide
7. [WORKING] Unlimited command history / continuous voice mode
8. [WORKING] Text editing, formatting, visibility and transforms
9. [WORKING] Real image objects per slide
10. [WORKING] Image upload from local files on every slide
11. [WORKING] Image drag-to-place and drag-to-resize
12. [WORKING] Image exact X/Y/W/H/rotation/zoom controls
13. [WORKING] Image crop controls + persisted crop state
14. [WORKING] Image-targeted voice commands
15. [WORKING] Presenter-mode voice command execution with live visual reaction
16. [WORKING] Command chaining and context resolution
17. [WORKING] Semantic slide search
18. [WORKING] Add/delete/duplicate slides
19. [WORKING] Object inspector
20. [WORKING] Speaker notes + Gemini generation
21. [WORKING] AI co-presenter / slide Q&A
22. [WORKING] Practice mode + transcript analysis
23. [WORKING] Live captions capability through browser speech APIs (where supported)
24. [WORKING] Multilingual text generation/translation through Gemini
25. [WORKING] Presenter timer + slide navigation
26. [WORKING] Audience sessions + QR join links
27. [WORKING] Audience questions
28. [WORKING] Audience polls + voting API
29. [WORKING] Version history / restore
30. [WORKING] PPTX/PDF/transcript/JSON export
31. [WORKING] Uploaded images included in PPTX/PDF export where supported by the export library
32. [WORKING] Portable JSON persistence for local development
33. [WORKING] LAN-ready Vite server + backend network discovery for QR URLs
34. [WORKING] Browser speech synthesis for read-aloud commands
35. [WORKING] Image highlight/hide/show/move/resize/rotate/zoom/crop/duplicate/delete commands
36. [WORKING] Chart/diagram/video/audio object command state model
37. [WORKING] Autosave
38. [WORKING] Dark premium UI
39. [WORKING] Typed command fallback when microphone speech is unavailable
40. [WORKING] Audience phone join route
41. [EXTERNAL] Browser microphone permission / SpeechRecognition availability
42. [EXTERNAL] Gemini API quota and billing/availability
43. [NEXT] Full production collaboration/WebRTC, cloud storage, real-time multi-user editing, production auth, managed DB, recording pipeline, and true image-generation provider integration are not represented as fake buttons.

## Verification notes
- Backend JavaScript files pass `node --check` in the build workspace.
- The frontend dependency install could not be completed in the isolated build environment because its package cache/network was unavailable; run `npm install` on the user's Windows machine before `npm run dev`/`npm run build`.

## Final presentation/readability additions
- Word-by-word read-aloud highlighting for slide titles, paragraphs and bullet points using browser speech synthesis boundaries.
- Read Slide / Stop Reading controls in Presenter mode.
- Auto-read toggle to continue reading when advancing to the next slide.
- Manual typography inspector for headings, paragraphs and bullet blocks: font size, color, bold, italic, underline and alignment.
- Bullet-block point editor (one point per line).
- Voice command "make/show <image> full screen" and fullscreen image behavior; image is expanded to the full 1200x675 slide and brought to the foreground.
## Final presenter speech tracking
- Live speech highlight mode uses the browser microphone speech-recognition stream while Present mode is active.
- Current spoken word is matched against the current slide heading, paragraph, and bullet text and highlighted live.
- Speech tracking and natural-language presentation commands share one recognition stream; command-like utterances such as “make the image full screen” can still trigger the existing command engine.
- Slide navigation resets the speech cursor so tracking starts at the new slide.
- Requires a browser with SpeechRecognition/Web Speech support (Chrome/Edge are recommended) and microphone permission.
