import { app, BrowserWindow, ipcMain, dialog, session } from "electron";
import { execSync } from "child_process";
import path from "path";
import log from "./log";
import { PtyService } from "./services/PtyService";
import { ProxyService } from "./services/ProxyService";
import { PersistenceService } from "./services/PersistenceService";
import { ContextService } from "./services/ContextService";
import { CodeServerService } from "./services/CodeServerService";
import { VaultService } from "./services/VaultService";
import { SupervisorService } from "./services/SupervisorService";
import { TranslatorService } from "./services/TranslatorService";
import { MonitorService } from "./services/MonitorService";
import { FileSystemService } from "./services/FileSystemService";
import { PersonaArchitectService } from "./services/PersonaArchitectService";
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
let fileSystemService: FileSystemService;
let personaArchitectService: PersonaArchitectService;

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
      webviewTag: true, // BrowserNode uses <webview> instead of <iframe>
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
  fileSystemService = new FileSystemService();
  personaArchitectService = new PersonaArchitectService();

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
    fileSystem: fileSystemService,
    personaArchitect: personaArchitectService,
    getWindow: () => mainWindow,
  });

  // Dialog handler
  ipcMain.handle("dialog:open", async (_event, options) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, options);
    if (result.canceled) return null;
    return result.filePaths[0] ?? null;
  });

  // Save dialog handler
  ipcMain.handle("dialog:save", async (_event, options) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, options);
    if (result.canceled) return null;
    return result.filePath ?? null;
  });

  // File write handler (for Persona Architect dossier output)
  ipcMain.handle("fs_write_file", async (_event, args: { filePath: string; content: string }) => {
    const fs = await import("fs/promises");
    await fs.writeFile(args.filePath, args.content, "utf-8");
    return { success: true, path: args.filePath };
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

// ---------------------------------------------------------------------------
// Cleanup: kill ALL child processes before the app dies
// ---------------------------------------------------------------------------

/** Collect all known PIDs from services, then tree-kill each one synchronously. */
function killAllChildProcesses(): void {
  // 1. Let services do their own cleanup first (uses tree-kill async internally)
  try { ptyService?.killAll(); } catch { /* ignore */ }
  try { codeServerService?.stopAll(); } catch { /* ignore */ }
  try { proxyService?.stopAll(); } catch { /* ignore */ }

  // 2. Sync sweep: collect any remaining PIDs and force-kill them
  const remainingPids = new Set<number>();
  try { ptyService?.getAllPids().forEach((p) => remainingPids.add(p)); } catch { /* ignore */ }
  try { codeServerService?.getAllPids().forEach((p) => remainingPids.add(p)); } catch { /* ignore */ }

  if (remainingPids.size === 0) return;

  log.info(`[orchestrated-space] Final sweep: killing ${remainingPids.size} remaining PIDs`);
  for (const pid of remainingPids) {
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /F /T /PID ${pid}`, {
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 5000,
        });
      } else {
        process.kill(pid, "SIGKILL");
      }
      log.info(`[orchestrated-space] Swept PID ${pid}`);
    } catch {
      // Already dead, ignore
    }
  }
}

app.on("before-quit", () => {
  killAllChildProcesses();
});

app.on("window-all-closed", () => {
  killAllChildProcesses();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Prevent non-critical native addon errors from crashing the app.
// node-pty's conpty_console_list_agent.js throws AttachConsole errors on Windows
// that are harmless but would kill the main process if unhandled.
process.on("uncaughtException", (err) => {
  if (
    err.message?.includes("AttachConsole failed") ||
    err.stack?.includes("conpty_console_list_agent")
  ) {
    return; // Silently swallow known node-pty Windows noise
  }
  log.error("[orchestrated-space] uncaught exception:", err.message, err.stack);
});
