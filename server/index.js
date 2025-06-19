// server/index.js
import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// Store active connections
const activeConnections = new Map();

// API Keys Management
let apiKeys = {
  twilio: { accountSid: '', authToken: '', phoneNumber: '' },
  deepgram: { apiKey: '' },
  openai: { apiKey: '' },
  elevenLabs: { apiKey: '', voiceId: '' }
};

// Import services (we'll create these next)
let twilioService, deepgramService, llmService, elevenLabsService;

async function initializeServices() {
  try {
    if (apiKeys.twilio.accountSid && apiKeys.twilio.authToken) {
      const { TwilioService } = await import('./services/twilioService.js');
      twilioService = new TwilioService(apiKeys.twilio);
    }
    if (apiKeys.deepgram.apiKey) {
      const { DeepgramService } = await import('./services/deepgramService.js');
      deepgramService = new DeepgramService(apiKeys.deepgram.apiKey);
    }
    if (apiKeys.openai.apiKey) {
      const { LLMService } = await import('./services/llmService.js');
      llmService = new LLMService(apiKeys.openai.apiKey);
    }
    if (apiKeys.elevenLabs.apiKey) {
      const { ElevenLabsService } = await import('./services/elevenLabsService.js');
      elevenLabsService = new ElevenLabsService(apiKeys.elevenLabs);
    }
  } catch (error) {
    console.error('Error initializing services:', error);
  }
}

// API Routes
app.post('/api/keys', (req, res) => {
  apiKeys = { ...apiKeys, ...req.body };
  initializeServices();
  res.json({ message: 'API keys updated successfully' });
});

app.get('/api/keys/status', (req, res) => {
  const status = {
    twilio: !!apiKeys.twilio.accountSid,
    deepgram: !!apiKeys.deepgram.apiKey,
    openai: !!apiKeys.openai.apiKey,
    elevenLabs: !!apiKeys.elevenLabs.apiKey
  };
  res.json(status);
});

app.post('/api/call/start', async (req, res) => {
  const { toNumber, systemPrompt } = req.body;
  
  if (!twilioService) {
    return res.status(400).json({ error: 'Twilio not configured' });
  }
  
  try {
    const callSid = await twilioService.initiateCall(toNumber, systemPrompt);
    res.json({ callSid, message: 'Call initiated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/call/end', async (req, res) => {
  const { callSid } = req.body;
  
  if (!twilioService) {
    return res.status(400).json({ error: 'Twilio not configured' });
  }
  
  try {
    await twilioService.endCall(callSid);
    res.json({ message: 'Call ended' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Twilio WebSocket endpoint
app.post('/twilio/stream', (req, res) => {
  const host = req.headers.host;
  const protocol = host.includes('localhost') ? 'ws' : 'wss';
  
  res.set('Content-Type', 'text/xml');
  res.send(`
    <Response>
      <Start>
        <Stream url="${protocol}://${host}/media-stream" />
      </Start>
      <Say voice="alice">Hello! I'm your AI assistant. Please start speaking after the beep.</Say>
      <Play>https://www.soundjay.com/misc/sounds/bell-ringing-05.wav</Play>
      <Pause length="60" />
    </Response>
  `);
});
// Serve static files
app.use(express.static(join(__dirname, '../client')));

// Default route
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, '../client/index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Open your browser to: http://localhost:${PORT}`);
});

// WebSocket server for media streams
const wss = new WebSocketServer({ server, path: '/media-stream' });

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  
  let conversationManager;
  let streamSid;
  let callSid;
  
  ws.on('message', async (message) => {
    const msg = JSON.parse(message);
    
    switch (msg.event) {
      case 'start':
  streamSid = msg.start.streamSid;
  callSid = msg.start.callSid;
  
  console.log(`Call started - streamSid: ${streamSid}, callSid: ${callSid}`);
  
  // Store streamSid on the websocket for later use
  ws.streamSid = streamSid;
  
  // Initialize conversation manager for this call
  if (deepgramService && llmService && elevenLabsService) {
    try {
      const { ConversationManager } = await import('./utils/conversationManager.js');
      conversationManager = new ConversationManager({
        streamSid,
        callSid,
        ws,
        deepgramService,
        llmService,
        elevenLabsService
      });
      
      activeConnections.set(callSid, conversationManager);
      await conversationManager.start();
    } catch (error) {
      console.error('Error initializing conversation manager:', error);
    }
  } else {
    console.error('Services not initialized:', {
      deepgram: !!deepgramService,
      llm: !!llmService,
      elevenLabs: !!elevenLabsService
    });
  }
  break;
        
      case 'media':
  if (conversationManager) {
    // Remove this line: console.log('Received audio from Twilio');
    conversationManager.processAudio(msg.media.payload);
  } else {
    // Keep this one as it's important for debugging
    console.log('No conversation manager for audio');
  }
  break;
        
      case 'stop':
        if (conversationManager) {
          await conversationManager.stop();
          activeConnections.delete(callSid);
        }
        break;
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
    if (conversationManager) {
      conversationManager.stop();
      if (callSid) {
        activeConnections.delete(callSid);
      }
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
  });
});