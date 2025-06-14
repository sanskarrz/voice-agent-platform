// server/utils/audioConverter.js
import WaveFile from 'wavefile';

export class AudioConverter {
  // Convert MP3/PCM audio to mulaw for Twilio
  static async convertToMulaw(audioBuffer, inputFormat = 'mp3') {
    try {
      // For MP3 from ElevenLabs, we need to convert to WAV first
      // Then to mulaw. For now, let's use a simpler approach
      
      // ElevenLabs returns MP3, but we can request PCM
      // This is a placeholder - in production you'd use ffmpeg or similar
      
      // For now, return the buffer as-is and handle in ElevenLabs service
      return audioBuffer.toString('base64');
    } catch (error) {
      console.error('Audio conversion error:', error);
      throw error;
    }
  }
  
  // Convert PCM16 to mulaw
  static pcm16ToMulaw(pcmBuffer) {
    const wav = new WaveFile.WaveFile();
    
    // Create WAV from PCM data
    wav.fromScratch(1, 8000, '16', pcmBuffer);
    
    // Convert to mulaw
    wav.toMuLaw();
    
    // Get the mulaw data
    return Buffer.from(wav.data.samples);
  }
}