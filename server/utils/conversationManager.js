// server/utils/conversationManager.js
import EventEmitter from 'events';

export class ConversationManager extends EventEmitter {
  constructor(config) {
    super();
    this.streamSid = config.streamSid;
    this.callSid = config.callSid;
    this.ws = config.ws;
    this.deepgramService = config.deepgramService;
    this.llmService = config.llmService;
    this.elevenLabsService = config.elevenLabsService;
    
    // State management
    this.isProcessing = false;
    this.isSpeaking = false;
    this.audioQueue = [];
    this.lastUserSpeechTime = Date.now();
    this.silenceThreshold = 1500; // 1.5s of silence before responding
    
    // Interruption handling
    this.currentPlaybackId = null;
    this.shouldInterrupt = false;
    
    // Metrics
    this.metrics = {
      turnCount: 0,
      avgResponseTime: 0,
      totalResponseTime: 0
    };
  }
  
  async start() {
    console.log(`Starting conversation for call ${this.callSid}`);
    
    try {
      // Connect to Deepgram
      await this.deepgramService.connect();
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Send initial greeting after a short delay
      setTimeout(async () => {
        console.log('Sending initial greeting...');
        try {
          await this.speak("Hello! I'm your AI assistant. How can I help you today?");
        } catch (error) {
          console.error('Error sending greeting:', error);
        }
      }, 1500);
    } catch (error) {
      console.error('Error starting conversation:', error);
    }
  }
  
  setupEventListeners() {
    // Handle transcripts from Deepgram
    this.deepgramService.on('transcript', async (data) => {
      if (data.isFinal && data.text.trim()) {
        console.log(`User said: ${data.text}`);
        this.lastUserSpeechTime = Date.now();
        
        // Handle interruption
        if (this.isSpeaking) {
          this.handleInterruption();
        }
        
        // Process user input
        await this.processUserInput(data.text);
      }
    });
    
    // Handle speech detection
    this.deepgramService.on('speech_started', () => {
      console.log('Speech detected');
      if (this.isSpeaking) {
        this.shouldInterrupt = true;
      }
    });
    
    // Handle utterance end
    this.deepgramService.on('utterance_end', () => {
      console.log('User stopped speaking');
    });
    
    // Handle Deepgram errors
    this.deepgramService.on('error', (error) => {
      console.error('Deepgram error:', error);
    });
  }
  
  async processUserInput(text) {
    if (this.isProcessing || text.trim().length < 2) return;
    
    this.isProcessing = true;
    const startTime = Date.now();
    
    console.log(`Processing user input: ${text}`);
    
    try {
      // Get response from LLM
      const response = await this.llmService.generateResponse(text);
      console.log(`LLM response: ${response.text}`);
      
      // Speak the response
      await this.speak(response.text);
      
      // Update metrics
      const responseTime = Date.now() - startTime;
      this.updateMetrics(responseTime);
      
    } catch (error) {
      console.error('Error processing input:', error);
      await this.speak("I'm sorry, I didn't catch that. Could you please repeat?");
    } finally {
      this.isProcessing = false;
    }
  }
  
async speak(text) {
  if (!text || text.trim().length === 0) return;
  
  console.log(`Speaking: ${text}`);
  
  const playbackId = Date.now().toString();
  this.currentPlaybackId = playbackId;
  this.isSpeaking = true;
  
  try {
    // For testing, use Twilio's Play verb with a public audio file
    const playMessage = {
      event: 'play',
      streamSid: this.streamSid,
      play: {
        url: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav'
      }
    };
    
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(playMessage));
      console.log('Sent play command to Twilio');
    }
    
    // For actual TTS, we'll need to:
    // 1. Generate audio with ElevenLabs
    // 2. Upload it to a public URL (or use base64 data URI)
    // 3. Play it using the play verb
    
    // For now, let's also try using Twilio's Say verb as a fallback
    setTimeout(() => {
      const sayMessage = {
        event: 'say',
        streamSid: this.streamSid,
        say: {
          text: text,
          voice: 'Polly.Joanna', // Try different voice
          language: 'en-US'
        }
      };
      
      if (this.ws && this.ws.readyState === 1) {
        this.ws.send(JSON.stringify(sayMessage));
        console.log('Sent say command to Twilio');
      }
    }, 500);
    
    // Simulate speaking time
    await new Promise(resolve => setTimeout(resolve, 2000));
    
  } catch (error) {
    console.error('TTS error:', error);
  } finally {
    if (this.currentPlaybackId === playbackId) {
      this.isSpeaking = false;
      this.currentPlaybackId = null;
    }
  }
}

// Helper function to convert linear PCM to mulaw
linearToMulaw(sample) {
  const MULAW_MAX = 0x1FFF;
  const MULAW_BIAS = 33;
  
  let sign = (sample >> 8) & 0x80;
  if (sign !== 0) sample = -sample;
  
  sample = Math.min(sample + MULAW_BIAS, MULAW_MAX);
  
  const exponent = Math.floor(Math.log2(sample) - 5);
  const mantissa = (sample >> (exponent + 3)) & 0x0F;
  
  return ~(sign | (exponent << 4) | mantissa) & 0xFF;
}
  
  handleInterruption() {
    console.log('Handling interruption');
    this.shouldInterrupt = true;
    
    // Clear Twilio audio queue
    this.clearTwilioAudio();
    
    // Reset state
    this.isSpeaking = false;
    this.currentPlaybackId = null;
    this.shouldInterrupt = false;
  }
  
 processAudio(base64Audio) {
  // Forward audio to Deepgram
  if (this.deepgramService && this.deepgramService.isConnected) {
    // Deepgram expects the base64 audio as-is from Twilio (it's already mulaw)
    this.deepgramService.sendAudio(base64Audio);
    
    // Log every 100th audio packet to avoid spam
    if (!this.audioPacketCount) this.audioPacketCount = 0;
    this.audioPacketCount++;
    if (this.audioPacketCount % 100 === 0) {
      console.log(`Processed ${this.audioPacketCount} audio packets`);
    }
  } else {
    // Only log this once
    if (!this.deepgramNotConnectedLogged) {
      console.error('Deepgram not connected');
      this.deepgramNotConnectedLogged = true;
    }
  }
}
  
 sendAudioToTwilio(audioData) {
  const mediaMessage = {
    event: 'media',
    streamSid: this.streamSid,
    media: {
      payload: audioData
    }
  };
  
  if (this.ws && this.ws.readyState === 1) {
    this.ws.send(JSON.stringify(mediaMessage));
    console.log('Sent audio chunk to Twilio');
  } else {
    console.error('WebSocket not ready for sending audio');
  }
}
  
  clearTwilioAudio() {
    const clearMessage = {
      event: 'clear',
      streamSid: this.streamSid
    };
    
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(clearMessage));
    }
  }
  
  updateMetrics(responseTime) {
    this.metrics.turnCount++;
    this.metrics.totalResponseTime += responseTime;
    this.metrics.avgResponseTime = this.metrics.totalResponseTime / this.metrics.turnCount;
    
    console.log(`Turn ${this.metrics.turnCount} - Response time: ${responseTime}ms (avg: ${Math.round(this.metrics.avgResponseTime)}ms)`);
  }
  
  async stop() {
    console.log(`Stopping conversation for call ${this.callSid}`);
    
    // Disconnect services
    if (this.deepgramService && this.deepgramService.isConnected) {
      await this.deepgramService.disconnect();
    }
    
    // Clear any ongoing audio
    this.handleInterruption();
    
    // Log final metrics
    console.log('Call metrics:', this.metrics);
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      deepgramMetrics: this.deepgramService.getMetrics()
    };
  }
}