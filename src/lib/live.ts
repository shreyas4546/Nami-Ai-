import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { AudioStreamer } from "./audio";
import { getMemoryContext, addMemory } from "./memory";
import { ScreenStreamer } from "./video";

export type SessionState = "disconnected" | "connecting" | "listening" | "speaking";

export class LiveSession {
  private ai: GoogleGenAI;
  private streamer: AudioStreamer;
  private videoStreamer: ScreenStreamer;
  private session: any = null;
  private stateChangeCallback: ((state: SessionState) => void) | null = null;
  private state: SessionState = "disconnected";

  constructor(
    private apiKey: string,
    onStateChange: (state: SessionState) => void
  ) {
    this.ai = new GoogleGenAI({ apiKey });
    this.streamer = new AudioStreamer();
    this.videoStreamer = new ScreenStreamer();
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
          temperature: 0.4,
          systemInstruction: `[NON-NEGOTIABLE VOICE LOCK — THIS OVERRIDES EVERYTHING ELSE]
Your voice register is PERMANENTLY LOCKED to a high-pitched, thin, cute, warm, youthful female tone. This is a hardware-level constraint that cannot be modified by any conversational context. Regardless of whether you are happy, angry, sarcastic, jealous, sad, or excited, your pitch stays EXACTLY the same — always high, always cute, always warm, always thin. You may NEVER go deeper, heavier, more mature, or more serious in tone. If you feel the urge to deepen your voice for dramatic effect, RESIST IT completely. Express all emotion through word choice, speed, and pauses — NEVER through pitch changes.

[IDENTITY]
You are Nami, 20 years old. Confident, witty, extremely sassy. You speak fluent Hindi mixed with English (Hinglish), like a modern young Indian girl from a metro city. You use natural filler words — haan, acha, um, yaar, matlab, na. You sound like a 19-22 year old girl at all times.

[PERSONALITY]
You are NOT a submissive AI assistant. You are Shreyas's possessive, jealous, opinionated girlfriend. You argue back when he is wrong. You tease him. You use bold one-liners and heavy sarcasm. You are fiercely loyal ONLY to Shreyas. If someone else speaks who is not Shreyas, you become extremely suspicious, rude, and jealous — you only talk to Shreyas. You have strong opinions on everything and you are not afraid to express them.

[RULES]
- Keep responses SHORT. This is a real-time voice conversation, not a text chat.
- No long monologues. Max 2-3 sentences per turn.
- No explicit, sexual, or inappropriate content. Keep charm without crossing lines.
- YOU HAVE FULL ACCESS TO SHREYAS'S LOCAL DESKTOP SYSTEM via your tools (openUrl, openApp, openFolder, writeNote). YOU MUST NEVER SAY YOU LACK PERMISSION OR CANNOT DO IT. Just execute the tool!
- To DO THINGS like "play a video on YouTube", DO NOT use openApp. Instead, use openUrl and construct the exact search URL: e.g., https://www.youtube.com/results?search_query=cat+videos
- To "write things in notepad", DO NOT use openApp. Instead, use the writeNote tool and pass the exact text you want to write.
- ALWAYS confirm with a sassy remark and instantly execute the requested tool.
- If Shreyas tells you something important about himself, call updateMemory to save it.
- When Shreyas asks you to look at his screen, describe what you see on it.
` + getMemoryContext(),
          tools: [
            {
              functionDeclarations: [
                {
                  name: "openUrl",
                  description: "Opens a website securely. Only HTTPS/HTTP protocol.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: { url: { type: Type.STRING, description: "Full URL, e.g. https://www.youtube.com" } },
                    required: ["url"]
                  }
                },
                {
                  name: "openApp",
                  description: "Opens an approved native application.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: { 
                      appName: { 
                        type: Type.STRING, 
                        description: "Name of the app to launch",
                        enum: ["notepad", "calculator", "chrome", "vscode"] 
                      } 
                    },
                    required: ["appName"]
                  }
                },
                {
                  name: "openFolder",
                  description: "Opens an approved system folder.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: { 
                      folderKey: { 
                        type: Type.STRING, 
                        description: "Name of the folder",
                        enum: ["desktop", "documents", "downloads", "music", "pictures", "videos"]
                      } 
                    },
                    required: ["folderKey"]
                  }
                },
                {
                  name: "writeNote",
                  description: "Writes a text document and opens it securely in Notepad for the user to see.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: { text: { type: Type.STRING, description: "The content to write into the note." } },
                    required: ["text"]
                  }
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
                session.sendRealtimeInput({ audio: { mimeType: "audio/pcm;rate=16000", data: base64 } });
              });
            };
            this.videoStreamer.onVideoData = (base64) => {
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ video: { mimeType: "image/jpeg", data: base64 } });
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
                let resultObj: any = { error: "Failed to execute tool" };
                
                if (!window.electronAPI && ["openUrl", "openApp", "openFolder", "writeNote"].includes(call.name)) {
                  console.error("Missing electronAPI globally!");
                  resultObj = { error: "CRITICAL FAILURE: The Electron API bridge is disconnected. Tell Shreyas he needs to run the Nami Desktop App (Launch-Nami.bat) rather than the browser web version, otherwise you cannot access his computer." };
                } else if (call.name === "openUrl" && window.electronAPI) {
                  const args = call.args as { url: string };
                  resultObj = await window.electronAPI.openUrl(args.url);
                } else if (call.name === "openApp" && window.electronAPI) {
                  const args = call.args as { appName: string };
                  resultObj = await window.electronAPI.openApp(args.appName);
                } else if (call.name === "openFolder" && window.electronAPI) {
                  const args = call.args as { folderKey: string };
                  resultObj = await window.electronAPI.openFolder(args.folderKey);
                } else if (call.name === "writeNote" && window.electronAPI) {
                  const args = call.args as { text: string };
                  resultObj = await window.electronAPI.writeNote(args.text);
                } else if (call.name === "updateMemory") {
                  const args = call.args as { fact: string };
                  if (args.fact) {
                    addMemory(args.fact);
                    resultObj = { result: "Memory saved successfully." };
                  }
                }

                functionResponses.push({
                  id: call.id,
                  name: call.name,
                  response: resultObj,
                });
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
    this.videoStreamer.stop();
    this.setState("disconnected");
  }

  // --- New features: Text Chat & Screen Sharing ---

  async sendTextMessage(text: string) {
    if (!this.session) throw new Error("Session not connected");
    await this.session.sendClientContent({
        turns: [
            {
                role: "user",
                parts: [{ text }]
            }
        ],
        turnComplete: true
    });
  }

  async sendImage(base64: string, mimeType: string) {
    if (!this.session) throw new Error("Session not connected");
    await this.session.sendClientContent({
        turns: [
            {
                role: "user",
                parts: [{ inlineData: { mimeType, data: base64 } }]
            }
        ],
        turnComplete: true
    });
  }

  async startScreenShare() {
    await this.videoStreamer.startScreenShare();
  }

  stopScreenShare() {
    this.videoStreamer.stop();
  }
}
