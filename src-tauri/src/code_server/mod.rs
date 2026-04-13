pub mod commands;

use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::Emitter;

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct CodeServerStatus {
    pub running: bool,
    pub port: u16,
    pub url: String,
}

/// Manages a single code-server child process.
///
/// code-server runs as a sidecar: Tauri spawns it, monitors it,
/// and kills it on shutdown. The frontend connects via iframe to
/// http://127.0.0.1:{port}.
pub struct CodeServerManager {
    process: Mutex<Option<Child>>,
    port: Mutex<u16>,
}

impl CodeServerManager {
    pub fn new() -> Self {
        Self {
            process: Mutex::new(None),
            port: Mutex::new(0),
        }
    }

    /// Start code-server on the given port, serving the given workspace.
    ///
    /// Uses --auth none because it only binds to 127.0.0.1 (local only).
    /// The iframe in React Flow connects to this address.
    pub fn start(
        &self,
        app: tauri::AppHandle,
        port: u16,
        workspace: String,
        binary_path: Option<String>,
    ) -> Result<CodeServerStatus, String> {
        let mut proc_guard = self.process.lock().unwrap();

        if proc_guard.is_some() {
            return Err("code-server already running. Stop it first.".into());
        }

        let binary = binary_path.unwrap_or_else(|| "code-server".into());
        let bind_addr = format!("127.0.0.1:{port}");

        let child = Command::new(&binary)
            .args(["--auth", "none"])
            .args(["--bind-addr", &bind_addr])
            .args(["--disable-telemetry"])
            .arg(&workspace)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("failed to start code-server at '{binary}': {e}"))?;

        *self.port.lock().unwrap() = port;
        *proc_guard = Some(child);

        let status = CodeServerStatus {
            running: true,
            port,
            url: format!("http://{bind_addr}"),
        };

        // Notify frontend that code-server is starting.
        // The iframe should retry connection until code-server is ready.
        let _ = app.emit("code-server-started", &status);

        Ok(status)
    }

    /// Stop the code-server process.
    pub fn stop(&self) {
        let mut proc_guard = self.process.lock().unwrap();
        if let Some(mut child) = proc_guard.take() {
            child.kill().ok();
            child.wait().ok();
        }
        *self.port.lock().unwrap() = 0;
    }

    /// Check if code-server is running and return its status.
    pub fn status(&self) -> CodeServerStatus {
        let mut proc_guard = self.process.lock().unwrap();
        let port = *self.port.lock().unwrap();

        let running = match proc_guard.as_mut() {
            Some(child) => {
                // try_wait: None = still running, Some = exited
                match child.try_wait() {
                    Ok(None) => true,
                    _ => {
                        // Process exited unexpectedly, clean up
                        proc_guard.take();
                        false
                    }
                }
            }
            None => false,
        };

        CodeServerStatus {
            running,
            port,
            url: if running {
                format!("http://127.0.0.1:{port}")
            } else {
                String::new()
            },
        }
    }
}
