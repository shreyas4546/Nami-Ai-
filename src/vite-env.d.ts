/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    openUrl: (url: string) => Promise<{ success: boolean; message?: string; error?: string }>;
    openApp: (appName: string) => Promise<{ success: boolean; message?: string; error?: string }>;
    openFolder: (folderKey: string) => Promise<{ success: boolean; message?: string; error?: string }>;
    writeNote: (text: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  };
}
