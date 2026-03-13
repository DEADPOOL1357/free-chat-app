import React, { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import {
  MessageCircle,
  Search,
  Plus,
  Send,
  Users,
  Lock,
  Globe,
  Trash2,
  User,
  Crown,
  X,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const socket = io(API_URL, { autoConnect: false });

export default function App() {
  const [nickname, setNickname] = useState(`Guest${Math.floor(Math.random() * 1000)}`);
  const [me, setMe] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoom, setNewRoom] = useState({ name: '', topic: '', isPrivate: false });
  const [threads, setThreads] = useState({});
  const [activePrivateUserId, setActivePrivateUserId] = useState(null);
  const [privateMessage, setPrivateMessage] = useState('');
  const [mode, setMode] = useState('rooms');

useEffect(() => {
  async function loadBootstrap() {
    try {
      const res = await fetch(`${API_URL}/bootstrap`);
      const payload = await res.json();
      setRooms(payload.rooms || []);
      setOnlineUsers(payload.onlineUsers || []);
      if (!activeRoomId && payload.rooms?.[0]) {
        setActiveRoomId(payload.rooms[0].id);
      }
    } catch (err) {
      console.error('Bootstrap fetch failed:', err);
    }
  }

  loadBootstrap();
  socket.connect();

  const onBootstrap = (payload) => {
    setMe(payload.me);
    setRooms(payload.rooms || []);
    setOnlineUsers(payload.onlineUsers || []);
    if (!activeRoomId && payload.rooms?.[0]) {
      setActiveRoomId(payload.rooms[0].id);
      socket.emit('room:join', { roomId: payload.rooms[0].id });
    }
  };

  const onPresenceUpdate = (users) => setOnlineUsers(users);
  const onRoomsUpdate = (nextRooms) => setRooms(nextRooms);
  const onRoomHistory = (room) => {
    setRooms((prev) => prev.map((item) => (item.id === room.id ? room : item)));
  };
  const onRoomMessage = ({ roomId, message }) => {
    setRooms((prev) =>
      prev.map((room) =>
        room.id === roomId
          ? { ...room, messages: [...(room.messages || []), message] }
          : room
      )
    );
  };
  const onRoomDeleted = ({ roomId }) => {
    setRooms((prev) => prev.filter((room) => room.id !== roomId));
    if (activeRoomId === roomId) setActiveRoomId(null);
  };
  const onPrivateThread = (thread) => {
    setThreads((prev) => ({ ...prev, [thread.id]: thread }));
  };

  socket.on('bootstrap', onBootstrap);
  socket.on('presence:update', onPresenceUpdate);
  socket.on('rooms:update', onRoomsUpdate);
  socket.on('room:history', onRoomHistory);
  socket.on('room:message', onRoomMessage);
  socket.on('room:deleted', onRoomDeleted);
  socket.on('private:thread', onPrivateThread);

  return () => {
    socket.off('bootstrap', onBootstrap);
    socket.off('presence:update', onPresenceUpdate);
    socket.off('rooms:update', onRoomsUpdate);
    socket.off('room:history', onRoomHistory);
    socket.off('room:message', onRoomMessage);
    socket.off('room:deleted', onRoomDeleted);
    socket.off('private:thread', onPrivateThread);
    socket.disconnect();
  };
}, [activeRoomId]);

  function handleJoin() {
    if (!nickname.trim()) return;
    socket.emit('user:register', { nickname });
  }

  function openRoom(roomId) {
    setMode('rooms');
    setActivePrivateUserId(null);
    setActiveRoomId(roomId);
    socket.emit('room:join', { roomId });
  }

  function sendRoomMessage() {
    if (!message.trim() || !activeRoomId) return;
    socket.emit('room:message', { roomId: activeRoomId, text: message });
    setMessage('');
  }

  function createRoom() {
    if (!newRoom.name.trim()) return;
    socket.emit('room:create', newRoom);
    setShowCreateRoom(false);
    setNewRoom({ name: '', topic: '', isPrivate: false });
  }

  function deleteRoom(roomId) {
    socket.emit('room:delete', { roomId });
  }

  function openPrivateChat(otherUserId) {
    setMode('private');
    setActivePrivateUserId(otherUserId);
    socket.emit('private:open', { otherUserId });
  }

  function sendPrivateMessage() {
    if (!privateMessage.trim() || !activePrivateUserId) return;
    socket.emit('private:message', { toUserId: activePrivateUserId, text: privateMessage });
    setPrivateMessage('');
  }

  const filteredRooms = useMemo(() => rooms.filter((room) => room.name.toLowerCase().includes(search.toLowerCase()) || room.topic.toLowerCase().includes(search.toLowerCase())), [rooms, search]);
  const activeRoom = rooms.find((room) => room.id === activeRoomId);
  const activeThread = me && activePrivateUserId ? threads[[me.id, activePrivateUserId].sort().join('__')] : null;
  const activePrivateUser = onlineUsers.find((user) => user.id === activePrivateUserId);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><MessageCircle size={20} /></div>
          <div>
            <h1>Free Chat</h1>
            <p>Rooms + private chat</p>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Your nickname</div>
          <input className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} />
          <button className="button primary full" onClick={handleJoin}>Join / Update</button>
        </div>

        <div className="card">
          <div className="row-between">
            <div className="card-title">Rooms</div>
            <button className="icon-button" onClick={() => setShowCreateRoom(true)}><Plus size={16} /></button>
          </div>
          <div className="search-box">
            <Search size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search rooms" />
          </div>
          <div className="list">
            {filteredRooms.map((room) => (
              <button key={room.id} className={`list-item ${activeRoomId === room.id && mode === 'rooms' ? 'active' : ''}`} onClick={() => openRoom(room.id)}>
                <div className="list-main">
                  <div className="list-title">{room.isPrivate ? <Lock size={14} /> : <Globe size={14} />} {room.name}</div>
                  <div className="list-subtitle">{room.topic}</div>
                </div>
                <div className="list-actions">
                  <span className="pill">{room.memberCount}</span>
                  {!['general', 'gaming', 'study'].includes(room.id) && (
                    <Trash2 size={14} className="danger-icon" onClick={(e) => { e.stopPropagation(); deleteRoom(room.id); }} />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="chat-panel">
        {mode === 'rooms' ? (
          <>
            <header className="chat-header">
              <div>
                <div className="chat-title">{activeRoom ? activeRoom.name : 'Select a room'}</div>
                <div className="chat-subtitle">{activeRoom?.topic || 'Open a room to start chatting'}</div>
              </div>
              <div className="chat-badge"><Crown size={14} /> Admin</div>
            </header>

            <div className="messages">
              {(activeRoom?.messages || []).map((msg) => (
                <div key={msg.id} className={`message ${msg.senderId === me?.id ? 'mine' : ''}`}>
                  <div className="message-meta">{msg.senderName} · {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  <div>{msg.text}</div>
                </div>
              ))}
            </div>

            <div className="composer">
              <input className="input grow" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type message in room" onKeyDown={(e) => e.key === 'Enter' && sendRoomMessage()} />
              <button className="button primary" onClick={sendRoomMessage}><Send size={16} /> Send</button>
            </div>
          </>
        ) : (
          <>
            <header className="chat-header">
              <div>
                <div className="chat-title">{activePrivateUser ? activePrivateUser.nickname : 'Select a user'}</div>
                <div className="chat-subtitle">Private chat</div>
              </div>
            </header>

            <div className="messages">
              {(activeThread?.messages || []).map((msg) => (
                <div key={msg.id} className={`message ${msg.senderId === me?.id ? 'mine' : ''}`}>
                  <div className="message-meta">{msg.senderName} · {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  <div>{msg.text}</div>
                </div>
              ))}
            </div>

            <div className="composer">
              <input className="input grow" value={privateMessage} onChange={(e) => setPrivateMessage(e.target.value)} placeholder="Type private message" onKeyDown={(e) => e.key === 'Enter' && sendPrivateMessage()} />
              <button className="button primary" onClick={sendPrivateMessage}><Send size={16} /> Send</button>
            </div>
          </>
        )}
      </main>

      <aside className="right-panel">
        <div className="card">
          <div className="card-title">Online users</div>
          <div className="list">
            {onlineUsers.map((user) => (
              <button key={user.id} className={`list-item ${activePrivateUserId === user.id && mode === 'private' ? 'active' : ''}`} onClick={() => openPrivateChat(user.id)}>
                <div className="list-main">
                  <div className="list-title"><User size={14} /> {user.nickname}{user.id === me?.id ? ' (You)' : ''}</div>
                  <div className="list-subtitle">Direct message</div>
                </div>
                <Users size={14} />
              </button>
            ))}
          </div>
        </div>
      </aside>

      {showCreateRoom && (
        <div className="modal-overlay" onClick={() => setShowCreateRoom(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row-between">
              <h3>Create room</h3>
              <button className="icon-button" onClick={() => setShowCreateRoom(false)}><X size={16} /></button>
            </div>
            <input className="input" placeholder="Room name" value={newRoom.name} onChange={(e) => setNewRoom((s) => ({ ...s, name: e.target.value }))} />
            <input className="input" placeholder="Topic" value={newRoom.topic} onChange={(e) => setNewRoom((s) => ({ ...s, topic: e.target.value }))} />
            <label className="checkbox-row">
              <input type="checkbox" checked={newRoom.isPrivate} onChange={(e) => setNewRoom((s) => ({ ...s, isPrivate: e.target.checked }))} />
              Private room
            </label>
            <button className="button primary full" onClick={createRoom}>Create</button>
          </div>
        </div>
      )}
    </div>
  );
}
