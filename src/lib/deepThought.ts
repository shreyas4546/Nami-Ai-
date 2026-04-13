import { GoogleGenAI, ThinkingLevel, Modality } from "@google/genai";
import { getMemoryContext } from "./memory";

export async function processComplexQuery(apiKey: string, audioBlob: Blob): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });

  const base64 = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1]);
    };
    reader.readAsDataURL(audioBlob);
  });

  const memoryContext = getMemoryContext();

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [
      {
        inlineData: {
          data: base64,
          mimeType: audioBlob.type
        }
      },
      "Please listen to this audio and answer the complex query. " + memoryContext
    ],
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      systemInstruction: "You are a highly intelligent, warm, sweet, and playful female AI assistant in your mid-20s. You are currently in 'Deep Thought' mode to solve a complex problem for the user. Provide a brilliant, accurate, and warmly bubbly response. Speak softly and smoothly. Keep it concise enough to be spoken aloud."
    }
  });

  const textResponse = response.text;
  if (!textResponse) return "";

  const ttsResponse = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: textResponse }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Kore" }
        }
      }
    }
  });

  const audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
  return audioBase64;
}
