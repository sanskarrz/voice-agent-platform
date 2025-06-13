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
        smart_format: true,
        encoding: 'mulaw',
        sample_rate: 8000,
        channels: 1,
        multichannel: false,
        interim_results: true,
        utterance_end_ms: 1000,
        vad_events: true,
        endpointing: 300
      });
      
      this.connection.on('open', () => {
        console.log('Deepgram connection opened');
        this.isConnected = true;
        this.emit('connected');
      });
      
      this.connection.on('transcript', (data) => {
        const transcript = data.channel.alternatives[0].transcript;
        
        if (transcript && transcript.trim() !== '') {
          this.emit('transcript', {
            text: transcript,
            isFinal: data.is_final,
            confidence: data.channel.alternatives[0].confidence,
            timestamp: Date.now()
          });
        }
      });
      
      this.connection.on('utterance_end', () => {
        this.emit('utterance_end');
      });
      
      this.connection.on('speech_started', () => {
        this.emit('speech_started');
      });
      
      this.connection.on('error', (error) => {
        console.error('Deepgram error:', error);
        this.emit('error', error);
      });
      
      this.connection.on('close', () => {
        console.log('Deepgram connection closed');
        this.isConnected = false;
        this.emit('disconnected');
      });
      
    } catch (error) {
      console.error('Error connecting to Deepgram:', error);
      throw error;
    }
  }
  
  sendAudio(audioData) {
    if (this.connection && this.isConnected) {
      // Convert base64 to buffer if needed
      const audioBuffer = Buffer.isBuffer(audioData) 
        ? audioData 
        : Buffer.from(audioData, 'base64');
        
      this.connection.send(audioBuffer);
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