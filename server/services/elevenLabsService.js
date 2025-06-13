// server/services/elevenLabsService.js
import axios from 'axios';
import WebSocket from 'ws';

export class ElevenLabsService {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.voiceId = config.voiceId || 'EXAVITQu4vr4xnSDxMaL'; // Default to Sarah voice
    this.wsConnection = null;
    this.isConnected = false;
  }
  
  // Stream TTS for lowest latency
  async streamTTS(text, onAudioChunk) {
    const startTime = Date.now();
    
    try {
      // Use turbo v2.5 model for lowest latency
      const url = `wss://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream-input?model_id=eleven_turbo_v2_5&optimize_streaming_latency=4`;
      
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(url, {
          headers: {
            'xi-api-key': this.apiKey,
          }
        });
        
        let audioChunks = [];
        let isFirstChunk = true;
        
        ws.on('open', () => {
          // Send text input
          ws.send(JSON.stringify({
            text: text,
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.0,
              use_speaker_boost: true
            },
            generation_config: {
              chunk_length_schedule: [50] // Smaller chunks for lower latency
            }
          }));
          
          // Send EOS
          ws.send(JSON.stringify({ text: '' }));
        });
        
        ws.on('message', (data) => {
          const response = JSON.parse(data.toString());
          
          if (response.audio) {
            const audioChunk = Buffer.from(response.audio, 'base64');
            audioChunks.push(audioChunk);
            
            if (isFirstChunk) {
              console.log(`TTS first chunk latency: ${Date.now() - startTime}ms`);
              isFirstChunk = false;
            }
            
            // Stream chunks immediately
            if (onAudioChunk) {
              onAudioChunk(audioChunk, response);
            }
          }
          
          if (response.isFinal) {
            ws.close();
          }
        });
        
        ws.on('close', () => {
          const totalLatency = Date.now() - startTime;
          console.log(`TTS total time: ${totalLatency}ms`);
          
          resolve({
            audioBuffer: Buffer.concat(audioChunks),
            latency: totalLatency,
            chunks: audioChunks.length
          });
        });
        
        ws.on('error', (error) => {
          console.error('ElevenLabs WebSocket error:', error);
          reject(error);
        });
      });
      
    } catch (error) {
      console.error('ElevenLabs error:', error);
      throw error;
    }
  }
  
  // Alternative REST API method (higher latency but more reliable)
  async generateSpeech(text) {
    const startTime = Date.now();
    
    try {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream`,
        {
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true
          }
        },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
          },
          responseType: 'arraybuffer'
        }
      );
      
      const latency = Date.now() - startTime;
      console.log(`TTS REST latency: ${latency}ms`);
      
      return {
        audioBuffer: Buffer.from(response.data),
        latency
      };
      
    } catch (error) {
      console.error('ElevenLabs REST error:', error);
      throw error;
    }
  }
  
  // Convert audio format for Twilio (to mulaw)
  convertToMulaw(audioBuffer) {
    // This is a simplified conversion - in production, use a proper audio library
    // Twilio expects 8kHz mulaw audio
    return audioBuffer.toString('base64');
  }
}