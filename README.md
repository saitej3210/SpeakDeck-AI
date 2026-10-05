# SpeakDeck AI — Enhanced Working Build

A local-first AI presentation editor/presenter built with React + Vite and Node + Express.

## Run

### Backend
```powershell
cd backend
npm install
npm start
```
Runs on `http://localhost:4000`.

### Frontend
```powershell
cd frontend
npm install
npm run dev
```
Runs on `http://localhost:5173` and is configured to listen on the LAN (`0.0.0.0`) so audience phones can join when Windows Firewall allows Node/Vite and both devices are on the same Wi-Fi.

## Gemini
Create `backend/.env`:
```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash
PORT=4000
DB_PATH=./data/speakdeck.json
FRONTEND_PORT=5173
```
Never put the key in frontend code or commit `.env`.

AI features include presentation generation, speaker notes, Q&A, structured natural-language command parsing, text transforms, and command chaining. Without a key, deterministic voice commands still work.

## Core interactions
- Add an image to every slide from the editor.
- Images are stored as real image data in the presentation object model, each with a stable object ID.
- Drag an object to place it, drag the blue corner handle to resize it, and use the Inspector for exact X/Y/W/H/rotation/zoom.
- Image crop controls are available in the Inspector and crop state is persisted.
- Voice commands can target images and other objects: highlight, hide/show, move, resize, rotate, zoom, crop, duplicate, delete, read aloud, explain, simplify, translate, and chained combinations.
- Continuous voice mode automatically restarts recognition after each utterance, allowing effectively unlimited commands while the presenter/editor remains open.
- Presenter mode includes the same continuous voice command bar; command results immediately mutate the live slide state.
- Audience QR codes use a LAN URL discovered by the backend rather than a `localhost` URL. Join via `/#/join/<code>`.
- Audience questions and polls use short polling so they work without a WebSocket server.
- PPTX/PDF export includes uploaded images where the underlying export library supports the image format.

## Important deployment note
This build is intended for local testing and a small self-hosted demo. It uses portable JSON persistence to avoid native SQLite build tooling. For a public production deployment, move persistence to a real managed database, use HTTPS, configure CORS, and store secrets in the platform secret manager.

### Presenter reading mode
Presenter mode now includes Read slide, Stop reading and Auto-read. Speech synthesis highlights each spoken word across headings, paragraphs and bullet points. The editor inspector also exposes typography controls for headings, text and bullet blocks. In presenter voice commands, "make the image full screen" expands an image to the entire slide.
### Live speech highlighting
In Presenter mode, use **Live speech highlight** in the voice bar. Speak naturally into the microphone and SpeakDeck tracks the current heading/paragraph/bullet word and highlights it on the slide. Command-like utterances remain available during tracking. Chrome/Edge microphone permission is required.
