// server.js
import express from 'express';
import http from 'http';
import { Server as SocketIO } from 'socket.io';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import dotenv from 'dotenv';
import { OAuth2Client } from 'google-auth-library';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new SocketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chatapp', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// MongoDB Models
const messageSchema = new mongoose.Schema({
  username: String,
  content: String,
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// Middleware
app.use(cors());
app.use(express.json());

// JWT Auth Middleware
function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token missing' });

  jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// OAuth 2.0 - Google Sign-In
const oauthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

app.post('/auth/google', async (req, res) => {
  const { token } = req.body;
  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    const user = {
      id: payload.sub,
      username: payload.name,
      email: payload.email
    };
    const jwtToken = jwt.sign(user, process.env.JWT_SECRET || 'secret', { expiresIn: '1h' });
    res.json({ token: jwtToken, user });
  } catch (err) {
    res.status(401).json({ error: 'Invalid Google token' });
  }
});

// Chat Endpoint (Protected)
app.get('/messages', authenticateToken, async (req, res) => {
  const messages = await Message.find().sort({ timestamp: -1 }).limit(50);
  res.json(messages.reverse());
});

// WebSocket Events
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Token missing'));

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    socket.user = user;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`🟢 ${socket.user.username} connected`);

  socket.on('chatMessage', async (msg) => {
    const message = new Message({
      username: socket.user.username,
      content: msg
    });
    await message.save();

    io.emit('chatMessage', {
      username: socket.user.username,
      content: msg,
      timestamp: new Date()
    });
  });

  socket.on('disconnect', () => {
    console.log(`🔴 ${socket.user.username} disconnected`);
  });
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
