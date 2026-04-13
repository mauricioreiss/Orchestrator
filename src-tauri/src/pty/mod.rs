pub mod commands;

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::Emitter;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use uuid::Uuid;

/// Holds the writer + child handle for a single PTY session.
/// The reader runs on a dedicated OS thread (not stored here).
struct PtyInstance {
    writer: Box<dyn Write + Send>,
    #[allow(dead_code)]
    master: Box<dyn portable_pty::MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    label: String,
}

#[derive(Serialize, Clone)]
pub struct PtyInfo {
    pub id: String,
    pub label: String,
}

/// Manages all active PTY sessions. Thread-safe via Mutex.
///
/// Design decisions:
/// - One OS thread per PTY reader (not tokio tasks) because portable-pty
///   uses blocking I/O. Tokio's spawn_blocking pool has a default limit
///   of 512 threads, but dedicated threads give us naming and isolation.
/// - Mutex contention is negligible: PTY creates are rare, writes target
///   one PTY at a time, and lock hold time is microseconds.
pub struct PtyManager {
    instances: Mutex<HashMap<String, PtyInstance>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            instances: Mutex::new(HashMap::new()),
        }
    }

    /// Spawn a new PTY running PowerShell.
    /// Returns the PTY UUID. Starts a background reader thread that
    /// emits `pty-output-{id}` events with Vec<u8> payloads.
    pub fn spawn(
        &self,
        app: tauri::AppHandle,
        cols: u16,
        rows: u16,
        cwd: Option<String>,
        label: Option<String>,
    ) -> Result<PtyInfo, String> {
        let pty_system = native_pty_system();

        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = pty_system
            .openpty(size)
            .map_err(|e| format!("openpty failed: {e}"))?;

        let mut cmd = CommandBuilder::new("powershell.exe");
        cmd.args(["-NoLogo", "-NoProfile"]);
        if let Some(ref dir) = cwd {
            cmd.cwd(dir);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("spawn failed: {e}"))?;

        // Slave is consumed after spawn, drop it
        drop(pair.slave);

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("take_writer failed: {e}"))?;

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("clone_reader failed: {e}"))?;

        let id = Uuid::new_v4().to_string();
        let label = label.unwrap_or_else(|| format!("Terminal {}", &id[..8]));

        let output_event = format!("pty-output-{id}");
        let exit_event = format!("pty-exit-{id}");
        let thread_id = id.clone();

        // Dedicated OS thread for reading PTY output.
        // Why not tokio::spawn_blocking? We want:
        // 1. Named threads for debugging (visible in task manager)
        // 2. No pool exhaustion risk with many terminals
        // 3. Direct control over thread lifetime
        std::thread::Builder::new()
            .name(format!("pty-reader-{}", &id[..8]))
            .spawn(move || {
                let mut buf = [0u8; 4096];
                loop {
                    match reader.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            let chunk = buf[..n].to_vec();
                            if app.emit(&output_event, chunk).is_err() {
                                break; // Window closed
                            }
                        }
                        Err(e) => {
                            log::debug!("pty reader {thread_id}: {e}");
                            break;
                        }
                    }
                }
                let _ = app.emit(&exit_event, &thread_id);
            })
            .map_err(|e| format!("reader thread spawn failed: {e}"))?;

        let info = PtyInfo {
            id: id.clone(),
            label: label.clone(),
        };

        let instance = PtyInstance {
            writer,
            master: pair.master,
            child,
            label,
        };

        self.instances.lock().unwrap().insert(id, instance);

        Ok(info)
    }

    /// Write raw bytes to a PTY's stdin. Called on every keystroke.
    pub fn write(&self, id: &str, data: &[u8]) -> Result<(), String> {
        let mut instances = self.instances.lock().unwrap();
        let instance = instances
            .get_mut(id)
            .ok_or_else(|| format!("PTY {id} not found"))?;

        instance
            .writer
            .write_all(data)
            .map_err(|e| format!("write failed: {e}"))?;

        // Flush immediately for low latency. Without this,
        // keystrokes can buffer and appear delayed.
        instance
            .writer
            .flush()
            .map_err(|e| format!("flush failed: {e}"))?;

        Ok(())
    }

    /// Resize a PTY. Called when the xterm.js container resizes.
    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let instances = self.instances.lock().unwrap();
        let instance = instances
            .get(id)
            .ok_or_else(|| format!("PTY {id} not found"))?;

        instance
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("resize failed: {e}"))?;

        Ok(())
    }

    /// Kill a single PTY and remove it from the map.
    /// The reader thread exits naturally when read() returns EOF.
    pub fn kill(&self, id: &str) -> Result<(), String> {
        let mut instances = self.instances.lock().unwrap();
        if let Some(mut inst) = instances.remove(id) {
            inst.child.kill().ok();
        }
        Ok(())
    }

    /// Kill all PTYs. Called on app shutdown.
    pub fn kill_all(&self) {
        let mut instances = self.instances.lock().unwrap();
        for (_, mut inst) in instances.drain() {
            inst.child.kill().ok();
        }
    }

    /// List active PTYs (id + label).
    pub fn list(&self) -> Vec<PtyInfo> {
        let instances = self.instances.lock().unwrap();
        instances
            .iter()
            .map(|(id, inst)| PtyInfo {
                id: id.clone(),
                label: inst.label.clone(),
            })
            .collect()
    }
}
