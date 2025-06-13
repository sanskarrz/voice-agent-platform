// server/services/deepgramService.js
import { createClient } from '@deepgram/sdk';
import EventEmitter from 'events';

export class DeepgramService extends EventEmitter {
  constructor(apiKey) {
    super();
    this.deepgram = createClient(apiKey);
    this.connection = null;
    this.isConnected = false;
  }
  
  async connect() {
    try {
      // Use Nova-2 model for lowest latency
      this.connection = this.deepgram.listen.live({
  model: 'nova-2',
  language: 'en-US',
  encoding: 'mulaw',
  sample_rate: 8000,
  channels: 1
});
      
      this.connection.on('open', () => {
  console.log('Deepgram connection opened');
  this.isConnected = true;
  this.emit('connected');
});

this.connection.on('transcript', (data) => {
  console.log('Deepgram transcript event:', JSON.stringify(data));
  // ... rest of the code
});

this.connection.on('metadata', (data) => {
  console.log('Deepgram metadata:', JSON.stringify(data));
});

this.connection.on('speech_started', () => {
  console.log('Deepgram detected speech started');
  this.emit('speech_started');
});

this.connection.on('utterance_end', () => {
  console.log('Deepgram detected utterance end');
  this.emit('utterance_end');
});
      
    } catch (error) {
      console.error('Error connecting to Deepgram:', error);
      throw error;
    }
  }
  
 sendAudio(audioData) {
  if (this.connection && this.isConnected) {
    try {
      // Twilio sends base64-encoded mulaw audio
      // Deepgram expects raw binary, so decode from base64
      const audioBuffer = Buffer.from(audioData, 'base64');
      if (!this.firstAudioLogged) {
        console.log('First audio packet size:', audioBuffer.length);
        console.log('First 10 bytes:', audioBuffer.slice(0, 10));
        this.firstAudioLogged = true;
      }
      this.connection.send(audioBuffer);
    } catch (error) {
      console.error('Error sending audio to Deepgram:', error);
    }
  } 
  
  else {
    console.error('Cannot send audio - Deepgram not connected');
  }
  
}
  
  async disconnect() {
    if (this.connection) {
      this.connection.finish();
      this.connection = null;
      this.isConnected = false;
    }
  }
  
  // Get real-time metrics
  getMetrics() {
    return {
      connected: this.isConnected,
      latency: this.lastLatency || 0
    };
  }
}