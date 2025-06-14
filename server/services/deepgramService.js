// server/services/deepgramService.js
import { createClient } from '@deepgram/sdk';
import WebSocket from 'ws';
import EventEmitter from 'events';

export class DeepgramService extends EventEmitter {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
    this.deepgram = createClient(apiKey);
    this.connection = null;
    this.isConnected = false;
    this.firstAudioLogged = false;
    
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
      console.log('Connecting to Deepgram WebSocket...');
      
      // Get the WebSocket URL with proper parameters
      const url = `wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000&channels=1&model=nova-2&language=en-US&punctuate=true&interim_results=true&utterance_end_ms=1000&vad_events=true`;
      
      // Create WebSocket connection
      this.connection = new WebSocket(url, {
        headers: {
          'Authorization': `Token ${this.apiKey}`
        }
      });
      
      this.connection.on('open', () => {
        console.log('Deepgram WebSocket opened successfully');
        this.isConnected = true;
        this.emit('connected');
      });
      
      this.connection.on('message', (data) => {
        try {
          const response = JSON.parse(data.toString());
          console.log('Deepgram message:', JSON.stringify(response));
          
          if (response.type === 'Results') {
            const transcript = response.channel?.alternatives?.[0]?.transcript;
            if (transcript && transcript.trim() !== '') {
              console.log(`User said: "${transcript}" (final: ${response.is_final})`);
              this.emit('transcript', {
                text: transcript,
                isFinal: response.is_final,
                confidence: response.channel.alternatives[0].confidence,
                timestamp: Date.now()
              });
            }
          } else if (response.type === 'Metadata') {
            console.log('Deepgram metadata:', response);
          } else if (response.type === 'UtteranceEnd') {
            console.log('Deepgram utterance end');
            this.emit('utterance_end');
          }
        } catch (error) {
          console.error('Error parsing Deepgram message:', error);
        }
      });
      
      this.connection.on('error', (error) => {
        console.error('Deepgram WebSocket error:', error);
        this.emit('error', error);
      });
      
      this.connection.on('close', (code, reason) => {
        console.log(`Deepgram WebSocket closed. Code: ${code}, Reason: ${reason}`);
        this.isConnected = false;
        this.emit('disconnected');
      });
      
    } catch (error) {
      console.error('Error connecting to Deepgram:', error);
      throw error;
    }
  }
  
  sendAudio(audioData) {
    if (this.connection && this.connection.readyState === WebSocket.OPEN) {
      try {
        // Twilio sends base64-encoded mulaw audio
        const audioBuffer = Buffer.from(audioData, 'base64');
        
        // Log first audio packet
        if (!this.firstAudioLogged) {
          console.log('First audio packet size:', audioBuffer.length);
          console.log('First 10 bytes:', Array.from(audioBuffer.slice(0, 10)));
          this.firstAudioLogged = true;
        }
        
        // Send raw audio buffer to Deepgram
        this.connection.send(audioBuffer);
      } catch (error) {
        console.error('Error sending audio to Deepgram:', error);
      }
    } else {
      console.error('Cannot send audio - Deepgram WebSocket not ready. State:', this.connection?.readyState);
    }
  }
  
  async disconnect() {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
      this.isConnected = false;
    }
  }
  
  getMetrics() {
    return {
      connected: this.isConnected,
      readyState: this.connection?.readyState
    };
  }
}