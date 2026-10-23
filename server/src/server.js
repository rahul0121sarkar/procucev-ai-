import 'dotenv/config';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import app from './app.js';
import { connectDB } from './config/db.js';
import { attachGeminiLive } from './services/geminiLive.js';

const port = Number(process.env.PORT || 5000);
await connectDB();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (pathname !== '/ws/transcribe') return socket.destroy();
  if (!process.env.GEMINI_API_KEY) return socket.destroy();
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (client) => attachGeminiLive(client, process.env.GEMINI_API_KEY));
server.listen(port, () => console.log(`API listening on http://localhost:${port}`));
