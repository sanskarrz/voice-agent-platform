// server/services/twilioService.js
import twilio from 'twilio';

export class TwilioService {
  constructor(config) {
    this.client = twilio(config.accountSid, config.authToken);
    this.phoneNumber = config.phoneNumber;
  }
  
  async initiateCall(toNumber, systemPrompt) {
  try {
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    console.log('Using base URL:', baseUrl); // Debug log
    
    const call = await this.client.calls.create({
      url: `${baseUrl}/twilio/stream`,
      to: toNumber,
      from: this.phoneNumber,
      record: true,
      machineDetection: 'DetectMessageEnd',
      machineDetectionTimeout: 3000
    });
    
    console.log('Call initiated:', call.sid);
    return call.sid;
  } catch (error) {
    console.error('Error initiating call:', error);
    throw error;
  }
}
  
  async endCall(callSid) {
    try {
      await this.client.calls(callSid).update({
        status: 'completed'
      });
    } catch (error) {
      console.error('Error ending call:', error);
      throw error;
    }
  }
  
  sendAudio(ws, audioData) {
    const mediaMessage = {
      event: 'media',
      streamSid: ws.streamSid,
      media: {
        payload: audioData
      }
    };
    
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(mediaMessage));
    }
  }
  
  sendMark(ws, markName) {
    const markMessage = {
      event: 'mark',
      streamSid: ws.streamSid,
      mark: {
        name: markName
      }
    };
    
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(markMessage));
    }
  }
  
  clearAudio(ws) {
    const clearMessage = {
      event: 'clear',
      streamSid: ws.streamSid
    };
    
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(clearMessage));
    }
  }
}