import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { Room } from './Room.js';
import { DEFAULT_ROOM, TICK_RATE, SNAPSHOT_RATE } from '../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DIST = path.resolve(__dirname, '../dist');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = new Map();

function roomName(raw) {
  const n = String(raw || DEFAULT_ROOM).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
  return n || DEFAULT_ROOM;
}

function getRoom(name) {
  let room = rooms.get(name);
  if (!room) {
    room = new Room(name, io);
    rooms.set(name, room);
    room.start();
    console.log(`[room] opened "${name}"`);
  }
  return room;
}

app.get('/api/rooms', (_req, res) => {
  res.json([...rooms.values()].map((r) => ({
    name: r.name, players: r.humanCount(), full: r.isFull(),
  })));
});

if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
} else {
  // No built client: in `npm run dev` the game is served by Vite on :5173, so send players there.
  app.get('/', (req, res) => {
    const host = String(req.hostname).replace(/[^\w.\-\[\]:]/g, '');
    const url = `http://${host}:5173/`;
    res.type('html').send(`<!doctype html><meta http-equiv="refresh" content="0; url=${url}">
<p style="font-family:sans-serif">Barn Wars is at <a href="${url}">${url}</a>. (To serve it from this port instead, run <code>npm run build</code> then <code>npm start</code>.)</p>`);
  });
}

io.on('connection', (socket) => {
  let room = null;

  socket.on('join', (msg = {}, ack) => {
    if (room) return;
    const name = roomName(msg.room);
    const r = getRoom(name);
    if (r.isFull()) {
      if (typeof ack === 'function') ack({ ok: false, error: 'That barn is full! Try another room.' });
      return;
    }
    room = r;
    socket.join(name);
    const p = room.addPlayer(socket.id, { name: msg.name, animal: msg.animal, socket });
    if (typeof ack === 'function') {
      ack({ ok: true, id: socket.id, room: name, name: p.name, tickRate: TICK_RATE, snapshotRate: SNAPSHOT_RATE });
    }
    console.log(`[room ${name}] ${p.name} joined as ${p.animalId} (${room.humanCount()} humans)`);
  });

  socket.on('input', (input) => {
    if (room) room.queueInput(socket.id, input);
  });

  socket.on('inputs', (batch) => {
    if (room && Array.isArray(batch)) for (const input of batch.slice(0, 8)) room.queueInput(socket.id, input);
  });

  socket.on('changeAnimal', (animal) => {
    if (room) room.changeAnimal(socket.id, animal);
  });

  socket.on('chat', (text) => {
    if (!room) return;
    const p = room.players.get(socket.id);
    const clean = String(text || '').slice(0, 120).trim();
    if (p && clean) io.to(room.name).emit('chat', { id: p.id, name: p.name, text: clean });
  });

  socket.on('pingCheck', (ack) => {
    if (typeof ack === 'function') ack(Date.now());
  });

  socket.on('disconnect', () => {
    if (!room) return;
    room.removePlayer(socket.id);
    if (room.humanCount() === 0) {
      room.stop();
      rooms.delete(room.name);
      console.log(`[room] closed "${room.name}"`);
    }
    room = null;
  });
});

server.listen(PORT, () => {
  console.log(`Barn Wars server listening on http://localhost:${PORT}`);
});
