// server/services/deepgramService.js
import { createClient } from '@deepgram/sdk';
import EventEmitter from 'events';

export class DeepgramService extends EventEmitter {
  constructor(apiKey) {
    super();
    this.deepgram = createClient(apiKey);
    this.connection = null;
    this.isConnected = false;
    this.firstAudioLogged = false;
    this.keepaliveInterval = null;
    
    // Test the API key
    this.testConnection();
  }
  
  async testConnection() {
    try {
      const { result, error } = await this.deepgram.manage.getProjects();
      if (error) {
        console.error('Deepgram API key test failed:', error);
      } else {
        console.log('Deepgram API key is valid. Projects:', result);
      }
    } catch (err) {
      console.error('Deepgram API key test error:', err);
    }
  }
  
  async connect() {
    try {
      // Use Nova-2 model for lowest latency with mulaw encoding for Twilio
      this.connection = this.deepgram.listen.live({
        model: 'nova-2',
        language: 'en-US',
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
        
        // Send a keepalive every 30 seconds
        this.keepaliveInterval = setInterval(() => {
          if (this.connection && this.isConnected) {
            this.connection.keepAlive();
            console.log('Deepgram keepalive sent');
          }
        }, 30000);
      });
      
      this.connection.on('transcript', (data) => {
        console.log('Deepgram transcript event:', JSON.stringify(data));
        
        const transcript = data.channel.alternatives[0].transcript;
        
        if (transcript && transcript.trim() !== '') {
          console.log(`User said: "${transcript}" (final: ${data.is_final})`);
          this.emit('transcript', {
            text: transcript,
            isFinal: data.is_final,
            confidence: data.channel.alternatives[0].confidence,
            timestamp: Date.now()
          });
        }
      });
      
      this.connection.on('metadata', (data) => {
        console.log('Deepgram metadata received:', JSON.stringify(data));
      });
      
      this.connection.on('speech_started', () => {
        console.log('Deepgram detected speech started');
        this.emit('speech_started');
      });
      
      this.connection.on('utterance_end', () => {
        console.log('Deepgram detected utterance end');
        this.emit('utterance_end');
      });
      
      this.connection.on('error', (error) => {
        console.error('Deepgram error event:', error);
        this.emit('error', error);
      });
      
      this.connection.on('warning', (warning) => {
        console.warn('Deepgram warning:', warning);
      });
      
      this.connection.on('close', (code, reason) => {
        console.log(`Deepgram connection closed. Code: ${code}, Reason: ${reason}`);
        this.isConnected = false;
        this.emit('disconnected');
        
        // Clear keepalive interval
        if (this.keepaliveInterval) {
          clearInterval(this.keepaliveInterval);
          this.keepaliveInterval = null;
        }
      });
      
      // Add a catch-all for any event
      this.connection.on('message', (message) => {
        console.log('Deepgram raw message:', message);
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
        
        // Log first audio packet details
        if (!this.firstAudioLogged) {
          console.log('First audio packet size:', audioBuffer.length);
          console.log('First 10 bytes:', audioBuffer.slice(0, 10));
          this.firstAudioLogged = true;
        }
        
        this.connection.send(audioBuffer);
      } catch (error) {
        console.error('Error sending audio to Deepgram:', error);
      }
    } else {
      console.error('Cannot send audio - Deepgram not connected');
    }
  }
  
  async disconnect() {
    if (this.connection) {
      this.connection.finish();
      this.connection = null;
      this.isConnected = false;
      
      // Clear keepalive interval
      if (this.keepaliveInterval) {
        clearInterval(this.keepaliveInterval);
        this.keepaliveInterval = null;
      }
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