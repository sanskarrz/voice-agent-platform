// server/services/elevenLabsService.js
import axios from 'axios';
import WebSocket from 'ws';
import { AudioConverter } from '../utils/audioConverter.js';

export class ElevenLabsService {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.voiceId = config.voiceId || 'EXAVITQu4vr4xnSDxMaL'; // Default to Sarah voice
  }
  
  // Use REST API with PCM output for Twilio compatibility
  async generateSpeech(text) {
    const startTime = Date.now();
    
    try {
      console.log(`Generating speech for: "${text}"`);
      
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
        {
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            style: 0.0,
            use_speaker_boost: true
          }
        },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/pcm' // Request PCM format
          },
          responseType: 'arraybuffer'
        }
      );
      
      const latency = Date.now() - startTime;
      console.log(`TTS latency: ${latency}ms`);
      
      // Convert PCM to mulaw
      const pcmBuffer = Buffer.from(response.data);
      const mulawBuffer = AudioConverter.pcm16ToMulaw(pcmBuffer);
      
      return {
        audioBuffer: mulawBuffer,
        latency
      };
      
    } catch (error) {
      console.error('ElevenLabs error:', error.response?.data || error.message);
      
      // Fallback: Generate silence
      const silenceBuffer = Buffer.alloc(8000); // 1 second of silence
      return {
        audioBuffer: silenceBuffer,
        error: true,
        latency: Date.now() - startTime
      };
    }
  }
  
  // For even lower latency, use streaming (optional)
  async streamTTS(text, onAudioChunk) {
    const startTime = Date.now();
    
    try {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream`,
        {
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8
          },
          output_format: 'pcm_16000' // PCM format for easier conversion
        },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json'
          },
          responseType: 'stream'
        }
      );
      
      let chunks = [];
      
      response.data.on('data', (chunk) => {
        chunks.push(chunk);
        
        // Process chunks when we have enough data
        if (chunks.length > 5) {
          const audioBuffer = Buffer.concat(chunks);
          chunks = [];
          
          // Convert to mulaw and send
          const mulawBuffer = AudioConverter.pcm16ToMulaw(audioBuffer);
          if (onAudioChunk) {
            onAudioChunk(mulawBuffer);
          }
        }
      });
      
      response.data.on('end', () => {
        if (chunks.length > 0) {
          const audioBuffer = Buffer.concat(chunks);
          const mulawBuffer = AudioConverter.pcm16ToMulaw(audioBuffer);
          if (onAudioChunk) {
            onAudioChunk(mulawBuffer);
          }
        }
        
        console.log(`TTS streaming completed in ${Date.now() - startTime}ms`);
      });
      
    } catch (error) {
      console.error('ElevenLabs streaming error:', error);
      throw error;
    }
  }
}