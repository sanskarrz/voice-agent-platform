// server/services/elevenLabsService.js
import axios from 'axios';

export class ElevenLabsService {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.voiceId = config.voiceId || 'EXAVITQu4vr4xnSDxMaL'; // Default to Sarah voice
  }
  
  async generateSpeech(text) {
    const startTime = Date.now();
    
    try {
      console.log(`Generating speech for: "${text}"`);
      
      // Request ULAW format directly from ElevenLabs
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
            'Accept': 'audio/mpeg' // We'll get MP3 and convert it
          },
          responseType: 'arraybuffer'
        }
      );
      
      const latency = Date.now() - startTime;
      console.log(`TTS latency: ${latency}ms`);
      
      // For now, return the MP3 buffer as-is
      // We'll handle conversion in the conversation manager
      return {
        audioBuffer: Buffer.from(response.data),
        format: 'mp3',
        latency
      };
      
    } catch (error) {
      console.error('ElevenLabs error:', error.response?.data || error.message);
      throw error;
    }
  }
}