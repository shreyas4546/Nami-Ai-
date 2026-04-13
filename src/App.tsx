/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Loader2, Radio, Brain, LogOut, Send, Image as ImageIcon, MonitorUp, MonitorOff } from "lucide-react";
import { motion } from "motion/react";
import { LiveSession, SessionState } from "./lib/live";
import { processComplexQuery } from "./lib/deepThought";
import { loadMemories } from "./lib/memory";
import { auth, signInWithGoogle, logOut } from "./firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { cn } from "./lib/utils";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [appMode, setAppMode] = useState<"live" | "deep">("live");
  const [state, setState] = useState<SessionState>("disconnected");
  const [deepState, setDeepState] = useState<"idle" | "recording" | "thinking" | "speaking">("idle");
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const sessionRef = useRef<LiveSession | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await loadMemories();
      }
      setIsAuthReady(true);
    });

    return () => {
      unsubscribe();
      if (sessionRef.current) {
        sessionRef.current.disconnect();
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
    };
  }, []);

  const toggleSession = async () => {
    if (state === "disconnected") {
      const apiKey = process.env.GEMINI_API_KEY as string;
      const session = new LiveSession(apiKey, setState);
      sessionRef.current = session;
      
      try {
        await session.connect();
        
        // Auto-start screen share by default
        try {
          await session.startScreenShare();
          setIsScreenSharing(true);
        } catch (e) {
          console.warn("Auto screen share was cancelled or failed:", e);
        }
        
      } catch (err: any) {
        console.error("Connection failed:", err);
        if (err?.message?.includes("Permission denied") || err?.name === "NotAllowedError") {
          alert("Microphone access was denied. Please allow microphone permissions in your browser to use the voice assistant.");
        } else {
          alert(`Failed to connect: ${err?.message || "Unknown error"}`);
        }
        setState("disconnected");
      }
    } else {
      if (sessionRef.current) {
        if (isScreenSharing) {
          sessionRef.current.stopScreenShare();
          setIsScreenSharing(false);
        }
        sessionRef.current.disconnect();
        sessionRef.current = null;
      }
    }
  };

  const toggleDeepThought = async () => {
    if (deepState === "idle") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        audioChunksRef.current = [];
        
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        
        recorder.onstop = async () => {
          setDeepState("thinking");
          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
          stream.getTracks().forEach(t => t.stop());
          
          try {
            const apiKey = process.env.GEMINI_API_KEY as string;
            const audioBase64 = await processComplexQuery(apiKey, blob);
            
            if (audioBase64) {
              setDeepState("speaking");
              const audioUrl = `data:audio/wav;base64,${audioBase64}`;
              const audio = new Audio(audioUrl);
              audioPlayerRef.current = audio;
              audio.onended = () => setDeepState("idle");
              audio.play();
            } else {
              setDeepState("idle");
            }
          } catch (err) {
            console.error(err);
            alert("Deep thought failed. Please try again.");
            setDeepState("idle");
          }
        };
        
        mediaRecorderRef.current = recorder;
        recorder.start();
        setDeepState("recording");
      } catch (err: any) {
        if (err?.name === "NotAllowedError") {
          alert("Microphone access was denied.");
        }
        setDeepState("idle");
      }
    } else if (deepState === "recording") {
      mediaRecorderRef.current?.stop();
    } else if (deepState === "speaking") {
      audioPlayerRef.current?.pause();
      setDeepState("idle");
    }
  };

  // Switch modes safely
  const handleModeSwitch = (mode: "live" | "deep") => {
    if (mode === appMode) return;
    
    // Cleanup live session
    if (sessionRef.current) {
      if (isScreenSharing) {
        sessionRef.current.stopScreenShare();
        setIsScreenSharing(false);
      }
      sessionRef.current.disconnect();
      sessionRef.current = null;
    }
    
    // Cleanup deep thought
    if (deepState === "recording") {
      mediaRecorderRef.current?.stop();
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    setDeepState("idle");
    
    setAppMode(mode);
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !sessionRef.current || state === "disconnected") return;
    try {
      await sessionRef.current.sendTextMessage(chatInput);
      setChatInput("");
    } catch (err) {
      console.error("Failed to send text message", err);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sessionRef.current || state === "disconnected") return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Url = event.target?.result as string;
      const base64 = base64Url.split(',')[1];
      try {
        await sessionRef.current!.sendImage(base64, file.type);
      } catch (err) {
        console.error("Failed to send image", err);
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleScreenShare = async () => {
    if (!sessionRef.current || state === "disconnected") return;
    if (isScreenSharing) {
      sessionRef.current.stopScreenShare();
      setIsScreenSharing(false);
    } else {
      try {
        await sessionRef.current.startScreenShare();
        setIsScreenSharing(true);
      } catch (err) {
        console.error("Screen sharing failed or cancelled", err);
        setIsScreenSharing(false);
      }
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <motion.div
            animate={{ opacity: 0.4, scale: 1 }}
            transition={{ duration: 4, repeat: Infinity, repeatType: "reverse" }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[100px] bg-gradient-to-r from-purple-500/20 to-pink-500/20"
          />
        </div>
        <div className="z-10 max-w-md w-full bg-white/5 border border-white/10 rounded-3xl p-8 text-center backdrop-blur-xl shadow-2xl">
          <Brain className="w-16 h-16 text-purple-400 mx-auto mb-6" />
          <h1 className="text-3xl font-bold mb-3 tracking-tight">AI Assistant</h1>
          <p className="text-white/60 mb-8 leading-relaxed">
            Sign in to give your AI permanent memory. She'll remember your conversations across sessions.
          </p>
          <button
            onClick={signInWithGoogle}
            className="w-full py-4 px-6 bg-white text-black hover:bg-gray-100 rounded-xl font-semibold transition-all flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              <path fill="none" d="M1 1h22v22H1z" />
            </svg>
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  const isLiveActive = state !== "disconnected";
  const isDeepActive = deepState !== "idle";

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center overflow-hidden relative">
      {/* Header */}
      <div className="absolute top-6 right-6 z-20 flex items-center gap-4">
        <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md">
          <img src={user.photoURL || ""} alt="User" className="w-6 h-6 rounded-full" />
          <span className="text-sm font-medium text-white/80">{user.displayName}</span>
        </div>
        <button 
          onClick={logOut}
          className="p-2 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 transition-colors text-white/60 hover:text-white"
          title="Sign Out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Mode Toggle */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 flex bg-white/5 p-1 rounded-full backdrop-blur-md border border-white/10">
        <button 
          onClick={() => handleModeSwitch("live")}
          className={cn("px-6 py-2 rounded-full text-sm font-medium transition-all", appMode === "live" ? "bg-purple-500 text-white shadow-lg" : "text-white/60 hover:text-white")}
        >
          Banter Mode
        </button>
        <button 
          onClick={() => handleModeSwitch("deep")}
          className={cn("px-6 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2", appMode === "deep" ? "bg-pink-600 text-white shadow-lg" : "text-white/60 hover:text-white")}
        >
          <Brain className="w-4 h-4" />
          Deep Thought
        </button>
      </div>

      {/* Background atmospheric effects */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            opacity: (state === "speaking" || deepState === "speaking") ? 0.8 : (state === "listening" || deepState === "recording") ? 0.4 : (deepState === "thinking" ? 0.6 : 0.1),
            scale: (state === "speaking" || deepState === "speaking") ? 1.2 : 1,
          }}
          transition={{ duration: 2, repeat: Infinity, repeatType: "reverse" }}
          className={cn(
            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[120px] transition-colors duration-1000",
            appMode === "live" ? "bg-gradient-to-r from-purple-500/20 to-pink-500/20" : "bg-gradient-to-r from-blue-500/20 to-pink-600/20"
          )}
        />
      </div>

      <div className="z-10 flex flex-col items-center gap-12">
        {/* Status Text */}
        <div className="h-8 flex items-center justify-center">
          <motion.p
            key={appMode === "live" ? state : deepState}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-sm uppercase tracking-[0.2em] font-mono text-white/60"
          >
            {appMode === "live" && state === "disconnected" && "System Idle"}
            {appMode === "live" && state === "connecting" && "Establishing Connection..."}
            {appMode === "live" && state === "listening" && "Listening..."}
            {appMode === "live" && state === "speaking" && "Synthesizing..."}
            
            {appMode === "deep" && deepState === "idle" && "Deep Thought Ready (Click to Record)"}
            {appMode === "deep" && deepState === "recording" && "Recording... (Click to Stop)"}
            {appMode === "deep" && deepState === "thinking" && "Processing Complex Query..."}
            {appMode === "deep" && deepState === "speaking" && "Synthesizing..."}
          </motion.p>
        </div>

        {/* Central Action Area */}
        <div className="flex items-center justify-center">

          {/* Central Button */}
          <div className="relative flex items-center justify-center">
          {/* Pulse rings */}
          {(isLiveActive || isDeepActive) && (
            <>
              <motion.div
                animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                transition={{ duration: deepState === "thinking" ? 1 : 2, repeat: Infinity, ease: "easeOut" }}
                className={cn(
                  "absolute inset-0 rounded-full",
                  (state === "speaking" || deepState === "speaking") ? "bg-pink-500" : (deepState === "thinking" ? "bg-blue-500" : "bg-purple-500")
                )}
              />
              <motion.div
                animate={{ scale: [1, 2], opacity: [0.3, 0] }}
                transition={{ duration: deepState === "thinking" ? 1 : 2, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
                className={cn(
                  "absolute inset-0 rounded-full",
                  (state === "speaking" || deepState === "speaking") ? "bg-pink-500" : (deepState === "thinking" ? "bg-blue-500" : "bg-purple-500")
                )}
              />
            </>
          )}

          <button
            onClick={appMode === "live" ? toggleSession : toggleDeepThought}
            className={cn(
              "relative z-10 w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500",
              "border border-white/10 backdrop-blur-xl shadow-2xl",
              (!isLiveActive && !isDeepActive)
                ? "bg-white/5 hover:bg-white/10"
                : (state === "connecting" || deepState === "thinking")
                ? "bg-blue-500/20 border-blue-500/50"
                : (state === "listening" || deepState === "recording")
                ? "bg-purple-500/30 border-purple-500/80 shadow-[0_0_40px_rgba(168,85,247,0.4)]"
                : "bg-pink-500/30 border-pink-500/80 shadow-[0_0_40px_rgba(236,72,153,0.4)]"
            )}
          >
            {(!isLiveActive && !isDeepActive) ? (
              <MicOff className="w-10 h-10 text-white/50" />
            ) : (state === "connecting" || deepState === "thinking") ? (
              <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
            ) : (state === "listening" || deepState === "recording") ? (
              <Mic className="w-10 h-10 text-purple-400" />
            ) : (
              <Radio className="w-10 h-10 text-pink-400 animate-pulse" />
            )}
          </button>
        </div>

        </div>

        {/* Waveform Visualization */}
        <div className="h-16 flex items-center justify-center gap-1">
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              animate={{
                height: (state === "speaking" || deepState === "speaking") ? ["10%", "100%", "10%"] : "10%",
              }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                delay: i * 0.1,
                ease: "easeInOut",
              }}
              className={cn(
                "w-1.5 rounded-full",
                (state === "speaking" || deepState === "speaking") ? "bg-pink-500" : "bg-white/10"
              )}
              style={{ height: "10%" }}
            />
          ))}
        </div>
      </div>

      {/* Persistent Chat Input Bar */}
      {appMode === "live" && state !== "disconnected" && state !== "connecting" && (
        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-3xl px-6 z-30 flex items-center gap-3"
        >
          {/* Screen Share Button */}
          <button
            onClick={toggleScreenShare}
            className={cn(
              "p-3 rounded-xl transition-all duration-300 border backdrop-blur-md shadow-lg",
              isScreenSharing ? "bg-green-500/20 border-green-500/50 text-green-400" : "bg-white/10 border-white/20 hover:bg-white/20 text-white/70 hover:text-white"
            )}
            title={isScreenSharing ? "Stop Screen Share" : "Share Screen with Nami"}
          >
            {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <MonitorUp className="w-5 h-5" />}
          </button>

          <form onSubmit={handleSendChat} className="flex-1 flex items-center gap-3 bg-white/10 backdrop-blur-xl border border-white/20 p-2 rounded-2xl shadow-2xl">
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              className="hidden" 
            />
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
              title="Share Image"
            >
              <ImageIcon className="w-5 h-5" />
            </button>
            <input 
              type="text" 
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Send Nami a link or message..."
              className="flex-1 bg-transparent text-white placeholder-white/40 focus:outline-none px-2"
            />
            <button 
              type="submit"
              disabled={!chatInput.trim()}
              className="p-3 bg-purple-500 hover:bg-purple-600 disabled:bg-purple-500/50 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </motion.div>
      )}

    </div>
  );
}
