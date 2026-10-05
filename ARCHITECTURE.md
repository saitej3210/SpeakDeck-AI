# SpeakDeck AI — Enhanced Architecture

## Frontend
React + TypeScript + Vite. The editor keeps the presentation as a structured object graph. Every slide object has a stable id, geometry, style and type-specific data. Images are stored as data URLs for a self-contained local presentation and can be moved/resized/cropped without flattening the slide.

The same NLU command endpoint is used by the editor and presenter. The presenter attaches the command bar to the live slide, so commands mutate the exact state being rendered.

## Backend
Node + Express. AI is Gemini through the REST `generateContent` endpoint. The historical `openaiService.js` filename is retained to avoid changing all imports, but it no longer imports the OpenAI SDK.

Persistence is a small JSON database adapter exposing the existing `prepare().run/get/all` interface. This avoids native SQLite build failures on Windows Node versions while keeping route code stable.

## Audience
The backend exposes `/api/network` to discover non-loopback IPv4 addresses. Vite listens on `0.0.0.0`. Presenter QR codes therefore point to a LAN URL instead of `localhost`, provided both devices are on the same network and Windows Firewall allows the dev servers.

Audience questions/polls currently use polling rather than pretending to be a WebSocket system.
