// server/utils/audioProcessor.js
import { Transform } from 'stream';

export class AudioProcessor {
  constructor() {
    this.audioBuffer = Buffer.alloc(0);
    this.chunkSize = 640; // 20ms at 8kHz
  }
  
  // Convert linear PCM to mulaw for Twilio
  linearToMulaw(sample) {
    const MULAW_MAX = 0x1FFF;
    const MULAW_BIAS = 33;
    const sign = (sample >> 8) & 0x80;
    
    if (sign !== 0) {
      sample = -sample;
    }
    
    sample = sample + MULAW_BIAS;
    
    if (sample > MULAW_MAX) {
      sample = MULAW_MAX;
    }
    
    const exponent = Math.floor(Math.log2(sample) - 5);
    const mantissa = (sample >> (exponent + 3)) & 0x0F;
    const mulawByte = ~(sign | (exponent << 4) | mantissa);
    
    return mulawByte & 0xFF;
  }
  
  // Convert audio buffer to mulaw base64
  convertToMulaw(audioBuffer, inputFormat = 'pcm16') {
    const samples = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2);
    const mulawBuffer = Buffer.alloc(samples.length);
    
    for (let i = 0; i < samples.length; i++) {
      mulawBuffer[i] = this.linearToMulaw(samples[i]);
    }
    
    return mulawBuffer.toString('base64');
  }
  
  // Process incoming Twilio audio (mulaw to PCM)
  processTwilioAudio(base64Audio) {
    const audioBuffer = Buffer.from(base64Audio, 'base64');
    const pcmBuffer = Buffer.alloc(audioBuffer.length * 2);
    
    for (let i = 0; i < audioBuffer.length; i++) {
      const mulaw = audioBuffer[i];
      const sample = this.mulawToLinear(mulaw);
      pcmBuffer.writeInt16LE(sample, i * 2);
    }
    
    return pcmBuffer;
  }
  
  // Mulaw to linear PCM conversion
  mulawToLinear(mulawByte) {
    const MULAW_BIAS = 33;
    const mulawValue = ~mulawByte;
    const sign = (mulawValue & 0x80) !== 0;
    const exponent = (mulawValue >> 4) & 0x07;
    const mantissa = mulawValue & 0x0F;
    
    let sample = ((mantissa << 3) + MULAW_BIAS) << exponent;
    
    if (sign) {
      sample = -sample;
    }
    
    return sample;
  }
  
  // Audio stream chunking for consistent packet sizes
  createChunker() {
    let buffer = Buffer.alloc(0);
    
    return new Transform({
      transform(chunk, encoding, callback) {
        buffer = Buffer.concat([buffer, chunk]);
        
        while (buffer.length >= this.chunkSize) {
          const packet = buffer.slice(0, this.chunkSize);
          buffer = buffer.slice(this.chunkSize);
          this.push(packet);
        }
        
        callback();
      },
      
      flush(callback) {
        if (buffer.length > 0) {
          this.push(buffer);
        }
        callback();
      }
    });
  }
  
  // Smooth audio playback with jitter buffer
  createJitterBuffer(targetDelayMs = 40) {
    const packets = [];
    let isPlaying = false;
    
    return {
      add(packet, timestamp) {
        packets.push({ packet, timestamp });
        packets.sort((a, b) => a.timestamp - b.timestamp);
        
        if (!isPlaying && packets.length >= 2) {
          isPlaying = true;
          this.startPlayback();
        }
      },
      
      startPlayback() {
        const interval = setInterval(() => {
          if (packets.length === 0) {
            isPlaying = false;
            clearInterval(interval);
            return;
          }
          
          const { packet } = packets.shift();
          this.onPacket(packet);
        }, 20); // 20ms packets
      },
      
      onPacket: () => {} // Override this
    };
  }
  
  // Audio level detection for voice activity
  getAudioLevel(audioBuffer) {
    const samples = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2);
    let sum = 0;
    
    for (let i = 0; i < samples.length; i++) {
      sum += Math.abs(samples[i]);
    }
    
    return sum / samples.length / 32768; // Normalize to 0-1
  }
  
  // Simple noise gate
  applyNoiseGate(audioBuffer, threshold = 0.01) {
    const level = this.getAudioLevel(audioBuffer);
    
    if (level < threshold) {
      // Return silence
      return Buffer.alloc(audioBuffer.length);
    }
    
    return audioBuffer;
  }
}