import log from "electron-log/main";

// File transport: auto-rotates, writes to %APPDATA%/maestri-x/logs/main.log
log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB per file
log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";

// Console transport: keep colored output for dev mode
log.transports.console.format = "[{h}:{i}:{s}] [{level}] {text}";

// Suppress non-fatal conpty noise from node-pty subprocess
const SUPPRESSED_PATTERNS = ["AttachConsole failed", "conpty_console_list"];

log.hooks.push((message) => {
  const text = message.data.map(String).join(" ");
  if (SUPPRESSED_PATTERNS.some((p) => text.includes(p))) {
    return false;
  }
  return message;
});

export default log;
