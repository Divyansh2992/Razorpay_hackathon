require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const io = new Server(server, {
  cors: {
    origin: [CLIENT_URL, 'http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors({ origin: [CLIENT_URL, 'http://localhost:5173', 'http://localhost:3000'], credentials: true }));
app.use(express.json());

// Routes
app.use('/api/checkout', require('./routes/checkout'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/invoice', require('./routes/invoice'));
app.use('/api/conversation', require('./routes/conversation'));
app.use('/api/recovery-live', require('./routes/recoveryLive'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date(), mongoState: mongoose.connection.readyState });
});

// Socket.io
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// Inject Socket.io into detection service
const detectionService = require('./services/detectionService');
detectionService.setSocketIO(io);

// MongoDB connection — try Atlas, fall back to local
const MONGODB_URI       = process.env.MONGODB_URI || 'mongodb://localhost:27017/revenue-recovery';
const MONGODB_LOCAL_URI = 'mongodb://localhost:27017/revenue-recovery';

async function connectMongo() {
  // Try Atlas / configured URI first
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log(`[MongoDB] Connected to Atlas ✅`);
    return;
  } catch (err) {
    console.warn(`[MongoDB] Atlas failed (${err.message}) — trying local MongoDB...`);
  }
  // Fallback to local
  try {
    await mongoose.connect(MONGODB_LOCAL_URI, { serverSelectionTimeoutMS: 4000 });
    console.log(`[MongoDB] Connected to local MongoDB ✅`);
  } catch (err2) {
    console.error('[MongoDB] Both Atlas and local failed:', err2.message);
    process.exit(1);
  }
}

connectMongo().then(() => {
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
    console.log(`[AI] Groq API key ${process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here' ? 'CONFIGURED ✅ (openai/gpt-oss-120b)' : 'NOT SET — AI unavailable'}`);
    console.log(`[Razorpay] ${process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID !== 'rzp_test_placeholder' ? 'Keys configured ✅' : 'Mock mode (add RAZORPAY_KEY_ID to .env for real checkout)'}`);
  });
});

module.exports = { app, io };
