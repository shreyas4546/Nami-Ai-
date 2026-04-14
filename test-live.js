require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

async function test(modelName) {
  try {
    const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
    const s = await ai.live.connect({model: modelName});
    console.log(modelName + ' SUCCESS');
    s.close();
  } catch (e) {
    console.error(modelName + ' ERROR: ' + e.message);
  }
}

test('gemini-3.1-flash-live-preview').then(() => test('gemini-2.0-flash-exp')).then(() => test('gemini-2.0-flash'));
