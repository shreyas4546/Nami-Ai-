import { LiveSendRealtimeInputParameters } from "@google/genai";
type Check<T> = { [K in keyof T]: T[K] };
export const param: Check<LiveSendRealtimeInputParameters> = {
  mediaChunks: []
};
