const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, ipcMain, shell, desktopCapturer } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");

let mainWindow = null;
let tray = null;
let isVisible = true;

const HOTKEY = "CommandOrControl+Shift+Space";

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: true,
    title: "Nami AI",
    icon: path.join(__dirname, "icon.png"),
    backgroundColor: "#050505",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
    autoHideMenuBar: true,
    show: false,
  });

  // Load the Vite dev server
  mainWindow.loadURL("http://localhost:3000");

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on("close", (e) => {
    // Minimize to tray instead of closing
    e.preventDefault();
    mainWindow.hide();
    isVisible = false;
  });
}

function createTray() {
  // Create a simple 16x16 tray icon
  const icon = nativeImage.createFromBuffer(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAAK/INwWK6QAAABl0RVh0U29mdHdhcmUAQWRvYmUgSW1hZ2VSZWFkeXHJZTwAAAEwSURBVDjLpZMxTgNBDEV/xkYKSBR0iIKGgoYzcAQuwxm4BiUVJ+AKFBQcgCJFGigQBTKb3cFm5w+yAoKkSPFo5Nn6/rYH/jOi7+nh5PXkPjhmA8xsz+dN87D/LOIEVkgOpsni4mFmR/fhNUmS3e7us/mwGCIiMPPp+OV1u7O+l1LtSpCklBIikp2Ow/rq8/X28g4gIoJIBIAnJyBSBuR1vu8fr3Y2tgDGGBARHBwcg/tzMANJGJCMiP0ANYDthx/vXt5fZoAqJbnnzq7Oa5KdRaAEUuCyB1QBjH4IVIEZQZIxhiSvZmdVqy9nV9dzjWNNFCgBOQIiIdAAVACZn6FYOqsG4vVu97j5Q3gBhARrMy86q+Orr8BTNNMACLinwBm9uff+AE9ASbpIP8bCgAAAABJRU5ErkJggg==",
      "base64"
    )
  );

  tray = new Tray(icon);
  tray.setToolTip("Nami AI — Ctrl+Shift+Space to toggle");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Nami",
      click: () => toggleWindow(),
    },
    {
      label: "Quit",
      click: () => {
        mainWindow.destroy();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    toggleWindow();
  });
}

function toggleWindow() {
  if (!mainWindow) return;

  if (isVisible) {
    mainWindow.hide();
    isVisible = false;
  } else {
    mainWindow.show();
    mainWindow.focus();
    isVisible = true;
  }
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  // Register global hotkey
  const registered = globalShortcut.register(HOTKEY, () => {
    toggleWindow();
  });

  if (!registered) {
    console.error(`Failed to register hotkey: ${HOTKEY}`);
  } else {
    console.log(`Hotkey registered: ${HOTKEY}`);
  }

  // Handle getDisplayMedia natively to capture the primary screen seamlessly
  mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      // Pick the primary screen (first source) automatically
      callback({ video: sources[0] });
    }).catch(err => {
      console.error('Error getting screen sources:', err);
      callback();
    });
  });

  // Automatically grant ALL media permissions (camera, mic, screen) silently
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'camera', 'microphone', 'display-capture', 'mediaKeySystem'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const allowedPermissions = ['media', 'camera', 'microphone', 'display-capture', 'mediaKeySystem'];
    if (allowedPermissions.includes(permission)) {
      return true;
    }
    return false;
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

// Prevent app from quitting when all windows are closed (stay in tray)
app.on("window-all-closed", (e) => {
  e.preventDefault();
});

// --- Safe IPC Handlers ---

ipcMain.handle("open-url", async (event, url) => {
  try {
    const validUrl = new URL(url);
    if (validUrl.protocol === "http:" || validUrl.protocol === "https:") {
      console.log(`[ACTION] Opening URL: ${url}`);
      await shell.openExternal(validUrl.toString());
      return { success: true, message: `Opened URL: ${url}` };
    }
    return { success: false, error: "Invalid URL protocol. Only HTTP/HTTPS allowed." };
  } catch (error) {
    return { success: false, error: `Invalid URL format: ${error.message}` };
  }
});

const ALLOWED_FOLDERS = {
  "desktop": "desktop",
  "documents": "documents",
  "downloads": "downloads",
  "music": "music",
  "pictures": "pictures",
  "videos": "videos"
};

ipcMain.handle("open-folder", async (event, folderKey) => {
  try {
    const key = folderKey.toLowerCase();
    if (!ALLOWED_FOLDERS[key]) {
      return { success: false, error: `Folder '${folderKey}' is not in the allowlist.` };
    }
    const folderPath = app.getPath(ALLOWED_FOLDERS[key]);
    console.log(`[ACTION] Opening Folder: ${folderPath}`);
    await shell.openPath(folderPath);
    return { success: true, message: `Opened ${folderKey} folder.` };
  } catch (error) {
    return { success: false, error: `Failed to open folder: ${error.message}` };
  }
});

const ALLOWED_APPS = {
  "notepad": "notepad.exe",
  "calculator": "calc.exe",
  "chrome": ["cmd.exe", ["/c", "start", "chrome"]],
  "vscode": ["cmd.exe", ["/c", "code"]]
};

ipcMain.handle("open-app", async (event, appName) => {
  try {
    const key = appName.toLowerCase();
    if (!ALLOWED_APPS[key]) {
      return { success: false, error: `App '${appName}' is not in the allowlist.` };
    }
    
    console.log(`[ACTION] Spawning App: ${appName}`);
    const command = ALLOWED_APPS[key];
    
    if (Array.isArray(command)) {
      spawn(command[0], command[1], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn(command, [], { detached: true, stdio: 'ignore' }).unref();
    }
    
    return { success: true, message: `Launched ${appName}.` };
  } catch (error) {
    return { success: false, error: `Failed to launch app: ${error.message}` };
  }
});

ipcMain.handle("write-note", async (event, text) => {
  try {
    const filePath = path.join(os.tmpdir(), "Nami_Note.txt");
    fs.writeFileSync(filePath, text, "utf-8");
    console.log(`[ACTION] Writing and opening note at: ${filePath}`);
    spawn("notepad.exe", [filePath], { detached: true, stdio: 'ignore' }).unref();
    return { success: true, message: "Opened note with your text." };
  } catch (error) {
    return { success: false, error: `Failed to write note: ${error.message}` };
  }
});

