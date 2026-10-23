# Procucev AI — Real-time Multilingual Transcription

A starter implementation for the Procucev hiring assignment.

## Stack

- Node.js + Express REST API
- MongoDB + Mongoose
- WebSocket bridge to Gemini Live API for streaming transcription
- React + Vite frontend
- Gemini 3.1 Flash TTS Preview endpoint for optional read-aloud playback

> Model availability, API access, and request formats can change. Confirm the model IDs enabled for your Google AI Studio API key. The assignment's core requirement is speech-to-text; TTS is an optional extra.

## Requirements

- Node.js 20+
- MongoDB running locally or a MongoDB Atlas URI
- Gemini API key from Google AI Studio

## Run locally

1. Copy `server/.env.example` to `server/.env` and set `MONGODB_URI` and `GEMINI_API_KEY`.
2. In one terminal:
   ```bash
   cd server
   npm install
   npm run dev
   ```
3. In another terminal:
   ```bash
   cd client
   npm install
   npm run dev
   ```
4. Open the Vite URL printed in the terminal.

The client expects the API at `http://localhost:5000` and the live WebSocket at `ws://localhost:5000/ws/transcribe` by default.

## API

- `GET /api/transcriptions` — list transcripts (newest first)
- `GET /api/transcriptions/:id` — read one transcript
- `POST /api/transcriptions` — create transcript `{ "text": "...", "language": "Hindi + English", "durationSeconds": 12 }`
- `PATCH /api/transcriptions/:id` — update transcript fields
- `DELETE /api/transcriptions/:id` — delete transcript
- `POST /api/tts` — create a WAV response from text using Gemini TTS
- `GET /api/health` — health check

## Live transcription protocol

The browser sends JSON messages to `/ws/transcribe`:

- `{ "type": "start" }`
- `{ "type": "audio", "data": "<base64 PCM 16kHz mono>" }`
- `{ "type": "stop" }`

The server forwards PCM audio to Gemini Live and emits `{ "type": "transcript", "text": "..." }` when incremental input transcription arrives. On stop, the client saves the completed transcript through the REST API.

## Important notes

- Keep the Gemini API key on the server; never put it in Vite variables or frontend code.
- Browser microphone access requires HTTPS in deployed environments (localhost is allowed for development).
- The Live API expects 16-bit little-endian PCM at 16 kHz. The included browser capture resamples audio and encodes PCM before sending.
- This is an assignment starter, not a production-secure deployment: add authentication, rate limiting, user ownership, quotas, and stronger WebSocket session validation before public deployment.
