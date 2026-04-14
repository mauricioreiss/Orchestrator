import { app, BrowserWindow, ipcMain, dialog, session } from "electron";
import path from "path";
import { PtyService } from "./services/PtyService";
import { ProxyService } from "./services/ProxyService";
import { PersistenceService } from "./services/PersistenceService";
import { ContextService } from "./services/ContextService";
import { CodeServerService } from "./services/CodeServerService";
import { VaultService } from "./services/VaultService";
import { SupervisorService } from "./services/SupervisorService";
import { TranslatorService } from "./services/TranslatorService";
import { MonitorService } from "./services/MonitorService";
import { registerIpcHandlers } from "./ipc/handlers";

// Force English locale so VS Code Web doesn't try to load missing pt-BR NLS bundles
app.commandLine.appendSwitch("lang", "en-US");

let mainWindow: BrowserWindow | null = null;

// Service singletons
let ptyService: PtyService;
let proxyService: ProxyService;
let persistenceService: PersistenceService;
let contextService: ContextService;
let codeServerService: CodeServerService;
let vaultService: VaultService;
let supervisorService: SupervisorService;
let translatorService: TranslatorService;
let monitorService: MonitorService;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // node-pty requires non-sandboxed main process
    },
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0a0a0f",
      symbolColor: "#cdd6f4",
      height: 36,
    },
    backgroundColor: "#0a0a0f",
    show: false,
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL("http://localhost:1420");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function initServices(): void {
  const dataDir = path.join(app.getPath("userData"), "maestri-x");

  persistenceService = new PersistenceService(dataDir);
  proxyService = new ProxyService();
  codeServerService = new CodeServerService();
  contextService = new ContextService();
  vaultService = new VaultService();
  translatorService = new TranslatorService();
  monitorService = new MonitorService();

  // PtyService needs window reference for webContents.send
  // Will be set after window creation
  ptyService = new PtyService();

  supervisorService = new SupervisorService(ptyService, codeServerService);
}

app.whenReady().then(() => {
  initServices();
  createWindow();

  // Set window reference on PtyService so it can emit events
  if (mainWindow) {
    ptyService.setWindow(mainWindow);
  }

  // Strip X-Frame-Options and CSP from ALL responses so iframes load any URL.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      if (
        lower === "x-frame-options" ||
        lower === "content-security-policy" ||
        lower === "content-security-policy-report-only"
      ) {
        delete headers[key];
      }
    }
    callback({ cancel: false, responseHeaders: headers });
  });

  // Register all 33 IPC handlers + dialog
  registerIpcHandlers({
    pty: ptyService,
    codeServer: codeServerService,
    context: contextService,
    persistence: persistenceService,
    vault: vaultService,
    supervisor: supervisorService,
    translator: translatorService,
    proxy: proxyService,
    monitor: monitorService,
    getWindow: () => mainWindow,
  });

  // Dialog handler
  ipcMain.handle("dialog:open", async (_event, options) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, options);
    if (result.canceled) return null;
    return result.filePaths[0] ?? null;
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      if (mainWindow) {
        ptyService.setWindow(mainWindow);
      }
    }
  });
});

// Cleanup on quit
app.on("before-quit", () => {
  ptyService?.killAll();
  codeServerService?.stopAll();
  proxyService?.stopAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Prevent non-critical native addon errors (conpty_console_list) from crashing the app
process.on("uncaughtException", (err) => {
  console.error("[Maestri-X] uncaught exception:", err.message);
});
