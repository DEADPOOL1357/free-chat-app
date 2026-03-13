import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);

const allowedOrigin = process.env.CLIENT_URL || '*';
app.use(cors({ origin: allowedOrigin }));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: allowedOrigin,
    methods: ['GET', 'POST']
  }
});

const users = new Map();
const socketsByUserId = new Map();

const rooms = new Map([
  ['general', {
    id: 'general',
    name: 'General',
    topic: 'Open chat for everyone',
    isPrivate: false,
    createdBy: 'system',
    members: new Set(),
    messages: [
      { id: 'm1', senderName: 'System', senderId: 'system', text: 'Welcome to General 👋', createdAt: new Date().toISOString(), system: true }
    ]
  }],
  ['gaming', {
    id: 'gaming',
    name: 'Gaming',
    topic: 'Talk games, squads, and streams',
    isPrivate: false,
    createdBy: 'system',
    members: new Set(),
    messages: [
      { id: 'm2', senderName: 'System', senderId: 'system', text: 'Say hello to other players.', createdAt: new Date().toISOString(), system: true }
    ]
  }],
  ['study', {
    id: 'study',
    name: 'Study',
    topic: 'Group study and focused discussion',
    isPrivate: false,
    createdBy: 'system',
    members: new Set(),
    messages: [
      { id: 'm3', senderName: 'System', senderId: 'system', text: 'Share notes and ask doubts here.', createdAt: new Date().toISOString(), system: true }
    ]
  }]
]);

const privateThreads = new Map();

function randomId(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function serializeRoom(room) {
  return {
    id: room.id,
    name: room.name,
    topic: room.topic,
    isPrivate: room.isPrivate,
    createdBy: room.createdBy,
    memberCount: room.members.size,
    messages: room.messages.slice(-100)
  };
}

function getThreadKey(a, b) {
  return [a, b].sort().join('__');
}

function getOrCreateThread(a, b) {
  const key = getThreadKey(a, b);
  if (!privateThreads.has(key)) {
    privateThreads.set(key, {
      id: key,
      participants: [a, b],
      messages: []
    });
  }
  return privateThreads.get(key);
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, usersOnline: users.size, rooms: [...rooms.values()].map(serializeRoom) });
});

app.get('/bootstrap', (_req, res) => {
  res.json({
    rooms: [...rooms.values()].map(serializeRoom),
    onlineUsers: [...users.values()]
  });
});

io.on('connection', (socket) => {
  socket.on('user:register', ({ nickname }) => {
    const cleanNickname = String(nickname || 'Guest').slice(0, 24).trim() || 'Guest';
    const user = {
      id: socket.id,
      nickname: cleanNickname,
      joinedAt: new Date().toISOString()
    };

    users.set(socket.id, user);
    socketsByUserId.set(socket.id, socket.id);

    socket.emit('bootstrap', {
      me: user,
      rooms: [...rooms.values()].map(serializeRoom),
      onlineUsers: [...users.values()]
    });

    io.emit('presence:update', [...users.values()]);
  });

  socket.on('room:create', ({ name, topic, isPrivate }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const cleanName = String(name || '').trim().slice(0, 40);
    const cleanTopic = String(topic || '').trim().slice(0, 120);
    if (!cleanName) return;

    const roomId = randomId('room');
    const room = {
      id: roomId,
      name: cleanName,
      topic: cleanTopic || 'Custom room',
      isPrivate: Boolean(isPrivate),
      createdBy: user.nickname,
      members: new Set([socket.id]),
      messages: [
        {
          id: randomId('msg'),
          senderName: 'System',
          senderId: 'system',
          text: `${user.nickname} created the room ${cleanName}.`,
          createdAt: new Date().toISOString(),
          system: true
        }
      ]
    };

    rooms.set(roomId, room);
    socket.join(roomId);
    io.emit('rooms:update', [...rooms.values()].map(serializeRoom));
  });

  socket.on('room:join', ({ roomId }) => {
    const user = users.get(socket.id);
    const room = rooms.get(roomId);
    if (!user || !room) return;

    room.members.add(socket.id);
    socket.join(roomId);
    socket.emit('room:history', serializeRoom(room));
    socket.to(roomId).emit('room:message', {
      roomId,
      message: {
        id: randomId('msg'),
        senderName: 'System',
        senderId: 'system',
        text: `${user.nickname} joined the room.`,
        createdAt: new Date().toISOString(),
        system: true
      }
    });
    room.messages.push({
      id: randomId('msg'),
      senderName: 'System',
      senderId: 'system',
      text: `${user.nickname} joined the room.`,
      createdAt: new Date().toISOString(),
      system: true
    });
    io.emit('rooms:update', [...rooms.values()].map(serializeRoom));
  });

  socket.on('room:leave', ({ roomId }) => {
    const user = users.get(socket.id);
    const room = rooms.get(roomId);
    if (!user || !room) return;
    room.members.delete(socket.id);
    socket.leave(roomId);
    io.emit('rooms:update', [...rooms.values()].map(serializeRoom));
  });

  socket.on('room:delete', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (['general', 'gaming', 'study'].includes(roomId)) return;
    rooms.delete(roomId);
    io.emit('rooms:update', [...rooms.values()].map(serializeRoom));
    io.to(roomId).emit('room:deleted', { roomId });
  });

  socket.on('room:message', ({ roomId, text }) => {
    const user = users.get(socket.id);
    const room = rooms.get(roomId);
    const cleanText = String(text || '').trim().slice(0, 1000);
    if (!user || !room || !cleanText) return;

    const message = {
      id: randomId('msg'),
      senderName: user.nickname,
      senderId: user.id,
      text: cleanText,
      createdAt: new Date().toISOString(),
      system: false
    };

    room.messages.push(message);
    io.to(roomId).emit('room:message', { roomId, message });
    io.emit('rooms:update', [...rooms.values()].map(serializeRoom));
  });

  socket.on('private:message', ({ toUserId, text }) => {
    const fromUser = users.get(socket.id);
    const toSocketId = socketsByUserId.get(toUserId);
    const cleanText = String(text || '').trim().slice(0, 1000);
    if (!fromUser || !toUserId || !cleanText) return;

    const thread = getOrCreateThread(socket.id, toUserId);
    const message = {
      id: randomId('pm'),
      senderId: fromUser.id,
      senderName: fromUser.nickname,
      text: cleanText,
      createdAt: new Date().toISOString()
    };

    thread.messages.push(message);
    socket.emit('private:thread', thread);
    if (toSocketId) {
      io.to(toSocketId).emit('private:thread', thread);
    }
  });

  socket.on('private:open', ({ otherUserId }) => {
    const user = users.get(socket.id);
    if (!user || !otherUserId) return;
    socket.emit('private:thread', getOrCreateThread(socket.id, otherUserId));
  });

  socket.on('disconnect', () => {
    users.delete(socket.id);
    socketsByUserId.delete(socket.id);
    for (const room of rooms.values()) {
      room.members.delete(socket.id);
    }
    io.emit('rooms:update', [...rooms.values()].map(serializeRoom));
    io.emit('presence:update', [...users.values()]);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
