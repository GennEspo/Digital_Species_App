const { app, BrowserWindow, Menu, Tray, session } = require("electron");
const path = require("path");

let mainWindow;
let tray = null;

// -----------------------------------------------------
// PASSO 1 — ABILITAZIONE WEBCAM E FLAGS
// -----------------------------------------------------
app.commandLine.appendSwitch("use-fake-ui-for-media-stream");    
app.commandLine.appendSwitch("enable-features", "MediaCapture"); 
app.commandLine.appendSwitch("allow-file-access-from-files");    
app.commandLine.appendSwitch("allow-insecure-localhost", "true");

// Cattura errori
process.on("unhandledRejection", (reason) => {
  console.error("⚠️ Unhandled Rejection:", reason);
});

// -----------------------------------------------------
// CREAZIONE FINESTRA
// -----------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    fullscreen: true,      // Occupa tutto lo schermo
    frame: false,          // Niente bordi
    transparent: true,     // Sfondo trasparente
    alwaysOnTop: true,     // Mettilo sopra le altre finestre
    hasShadow: false,
    resizable: false,
    
    // --- QUI HO INSERITO L'ICONA ---
    icon: path.join(__dirname, "icon.ico"),
    // -------------------------------

    webPreferences: {
      // --- MODIFICHE FONDAMENTALI PER V9.0 ---
      nodeIntegration: true,    // NECESSARIO
      contextIsolation: false,  // NECESSARIO
      // ---------------------------------------
      
      preload: path.join(__dirname, "preload.js"),
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      experimentalFeatures: true
    },
  });

  // Carica il file HTML
  mainWindow.loadFile("renderer/idle-species.html");

  // mainWindow.webContents.openDevTools({ mode: "detach" });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// -----------------------------------------------------
// GESTIONE PERMESSI (WEBCAM / MIC)
// -----------------------------------------------------
app.on("session-created", (sess) => {
  sess.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ["media", "audioCapture", "videoCapture"];
    if (allowedPermissions.includes(permission)) {
      callback(true); 
    } else {
      callback(false);
    }
  });
});

// -----------------------------------------------------
// AVVIO APPLICAZIONE
// -----------------------------------------------------
app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// -----------------------------------------------------
// CHIUSURAS
// -----------------------------------------------------
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});