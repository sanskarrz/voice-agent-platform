// server/services/llmService.js
import OpenAI from 'openai';
import Groq from 'groq-sdk';

export class LLMService {
  constructor(apiKey, provider = 'openai') {
    this.provider = provider;
    
    if (provider === 'groq') {
      this.client = new Groq({ apiKey });
      this.model = 'llama3-70b-8192'; // Fastest Groq model
    } else {
      this.client = new OpenAI({ apiKey });
      this.model = 'gpt-4o-mini'; // Fastest OpenAI model
    }
    
    this.conversationHistory = [];
    this.systemPrompt = 'You are a helpful AI assistant on a phone call. Be concise, natural, and conversational. Respond quickly and avoid long explanations.';
  }
  
  setSystemPrompt(prompt) {
    this.systemPrompt = prompt;
  }
  
  async generateResponse(userInput, options = {}) {
    const startTime = Date.now();
    
    try {
      // Add user message to history
      this.conversationHistory.push({
        role: 'user',
        content: userInput
      });
      
      // Keep conversation history manageable (last 10 messages)
      if (this.conversationHistory.length > 10) {
        this.conversationHistory = this.conversationHistory.slice(-10);
      }
      
      const messages = [
        { role: 'system', content: this.systemPrompt },
        ...this.conversationHistory
      ];
      
      // Stream response for lower latency
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.7,
        max_tokens: 150, // Keep responses short for phone calls
        stream: true,
        ...options
      });
      
      let fullResponse = '';
      const chunks = [];
      
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          chunks.push({
            content,
            timestamp: Date.now() - startTime
          });
          
          // Emit chunk for early TTS processing
          if (options.onChunk) {
            options.onChunk(content);
          }
        }
      }
      
      // Add assistant response to history
      this.conversationHistory.push({
        role: 'assistant',
        content: fullResponse
      });
      
      const latency = Date.now() - startTime;
      console.log(`LLM response time: ${latency}ms`);
      
      return {
        text: fullResponse,
        chunks,
        latency,
        model: this.model
      };
      
    } catch (error) {
      console.error('LLM error:', error);
      
      // Fallback response
      const fallback = "I'm having trouble understanding. Could you repeat that?";
      this.conversationHistory.push({
        role: 'assistant',
        content: fallback
      });
      
      return {
        text: fallback,
        error: true,
        latency: Date.now() - startTime
      };
    }
  }
  
  // Clear conversation history
  clearHistory() {
    this.conversationHistory = [];
  }
  
  // Get conversation summary
  getConversationSummary() {
    return this.conversationHistory;
  }
}