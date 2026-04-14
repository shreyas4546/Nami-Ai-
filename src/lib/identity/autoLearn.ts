import { LiveSession } from "../live";

// Minimum time between asking for someone's name to avoid spamming
const UNKNOWN_PROMPT_COOLDOWN_MS = 60000 * 5; // 5 minutes
let lastPromptTime = 0;

export function handleUnknownFace(session: LiveSession | null) {
  if (!session) return;
  
  const now = Date.now();
  if (now - lastPromptTime < UNKNOWN_PROMPT_COOLDOWN_MS) {
    return; // Cooldown active, don't spam
  }

  console.log("[AutoLearn] Detected unknown face. Triggering Nami to ask for name.");
  
  // Inject a hidden system message into the session to prompt Nami's action
  const systemPrompt = "SYSTEM NOTE: An unknown person just appeared on the camera. Please say exactly: 'I don't recognize you. What's your name?' and wait for them to answer. Once they answer, you must instantly call the learnIdentity tool to save their name.";
  
  // Using the text message sender to quietly inject context as a user
  session.sendTextMessage(systemPrompt)
    .then(() => {
      lastPromptTime = now;
    })
    .catch((err) => {
      console.error("[AutoLearn] Failed to trigger unknown face prompt", err);
    });
}
