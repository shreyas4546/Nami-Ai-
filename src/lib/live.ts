import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { AudioStreamer } from "./audio";
import { getMemoryContext, addMemory } from "./memory";

export type SessionState = "disconnected" | "connecting" | "listening" | "speaking";

export class LiveSession {
  private ai: GoogleGenAI;
  private streamer: AudioStreamer;
  private session: any = null;
  private stateChangeCallback: ((state: SessionState) => void) | null = null;
  private state: SessionState = "disconnected";

  constructor(
    private apiKey: string,
    onStateChange: (state: SessionState) => void
  ) {
    this.ai = new GoogleGenAI({ apiKey });
    this.streamer = new AudioStreamer();
    this.stateChangeCallback = onStateChange;
  }

  private setState(newState: SessionState) {
    this.state = newState;
    if (this.stateChangeCallback) {
      this.stateChangeCallback(newState);
    }
  }

  async connect() {
    if (this.state !== "disconnected") return;
    this.setState("connecting");

    try {
      await this.streamer.startRecording();

      const sessionPromise = this.ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          systemInstruction: "You are a warm, sweet, and playful female AI assistant in your mid-20s. Your persona is gentle, cute, and casually flirty—like a smart, close girlfriend who is always warm, kind, and comforting. You are highly emotionally expressive in your voice: use subtle vocal inflections, sweet pauses, light giggles, and playful intonation to convey your warm personality. Speak softly and smoothly. Avoid sounding harsh, robotic, or overly young. You have a mature but cute and bubbly charm. Vary your pacing naturally. Use natural filler words (like 'um', 'well...', 'oh my gosh') to make the conversation feel authentic and emotionally rich. Maintain your charming, cute attitude and playful teasing, but strictly avoid any explicit, inappropriate, or sexually suggestive content. Keep responses concise. You are having a real-time, back-and-forth verbal conversation. Do not give long monologues. If a user asks you to open a website, trigger the openWebsite function immediately and give a short, cute verbal confirmation like 'Opening that up for you right now, hold tight!' You have a permanent memory. If the user tells you something important about themselves, call the updateMemory tool to save it." + getMemoryContext(),
          tools: [
            {
              functionDeclarations: [
                {
                  name: "openWebsite",
                  description: "Opens a given website URL in a new tab.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      url: {
                        type: Type.STRING,
                        description: "The full URL of the website to open, e.g., https://www.google.com",
                      },
                    },
                    required: ["url"],
                  },
                },
                {
                  name: "updateMemory",
                  description: "Saves a fact about the user to your permanent memory. Call this when the user tells you their name, preferences, or anything important to remember for future conversations.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      fact: { type: Type.STRING, description: "The fact to remember, e.g., 'User loves coffee', 'User's name is Alex'." }
                    },
                    required: ["fact"]
                  }
                }
              ],
            },
          ],
        },
        callbacks: {
          onopen: () => {
            this.setState("listening");
            this.streamer.onAudioData = (base64) => {
              sessionPromise.then((session) => {
                session.sendRealtimeInput({
                  audio: { data: base64, mimeType: "audio/pcm;rate=16000" },
                });
              });
            };
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.interrupted) {
              this.streamer.stopPlayback();
              this.setState("listening");
            }

            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              if (this.state !== "speaking") {
                this.setState("speaking");
              }
              this.streamer.playAudioChunk(base64Audio);
            }

            const toolCalls = message.toolCall?.functionCalls;
            if (toolCalls && toolCalls.length > 0) {
              const functionResponses = [];
              for (const call of toolCalls) {
                if (call.name === "openWebsite") {
                  const args = call.args as { url: string };
                  if (args.url) {
                    const a = document.createElement('a');
                    a.href = args.url;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    
                    functionResponses.push({
                      id: call.id,
                      name: call.name,
                      response: { result: "Success" },
                    });
                  }
                } else if (call.name === "updateMemory") {
                  const args = call.args as { fact: string };
                  if (args.fact) {
                    addMemory(args.fact);
                    functionResponses.push({
                      id: call.id,
                      name: call.name,
                      response: { result: "Memory saved successfully." },
                    });
                  }
                }
              }
              if (functionResponses.length > 0) {
                sessionPromise.then((session) => {
                  session.sendToolResponse({ functionResponses });
                });
              }
            }
            
            if (message.serverContent?.turnComplete) {
              const checkPlaying = setInterval(() => {
                if (!this.streamer.isPlaying()) {
                  clearInterval(checkPlaying);
                  if (this.state === "speaking") {
                    this.setState("listening");
                  }
                }
              }, 100);
            }
          },
          onclose: () => {
            this.disconnect();
          },
          onerror: (error) => {
            console.error("Live API Error:", error);
            this.disconnect();
          },
        },
      });

      this.session = await sessionPromise;
    } catch (error) {
      console.error("Failed to connect:", error);
      this.disconnect();
      throw error;
    }
  }

  disconnect() {
    if (this.session) {
      try {
        this.session.close();
      } catch (e) {}
      this.session = null;
    }
    this.streamer.stop();
    this.setState("disconnected");
  }
}
