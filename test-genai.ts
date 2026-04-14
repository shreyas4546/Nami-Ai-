import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({apiKey:'x'});
ai.live.connect({model:'m'}).then(s => {
  s.sendRealtimeInput([{mimeType: 'x', data: 'y'}]);
  s.sendRealtimeInput({ mediaChunks: [{mimeType: 'x', data: 'y'}] });
  s.sendRealtimeInput({ audio: {mimeType: 'x', data: 'y'} });
});
