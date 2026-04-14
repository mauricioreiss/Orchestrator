use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::Emitter;
use uuid::Uuid;

use super::models::{OutputBuffer, PtyInfo, PtyInstance};

/// Strip ANSI escape sequences from raw bytes.
/// Handles CSI sequences (\x1b[...X) and OSC sequences (\x1b]...\x07).
fn strip_ansi_escapes(data: &[u8]) -> Vec<u8> {
    let mut result = Vec::with_capacity(data.len());
    let mut i = 0;
    while i < data.len() {
        if data[i] == 0x1b && i + 1 < data.len() {
            match data[i + 1] {
                b'[' => {
                    // CSI sequence: skip until final byte (0x40-0x7E)
                    i += 2;
                    while i < data.len() && !(0x40..=0x7E).contains(&data[i]) {
                        i += 1;
                    }
                    if i < data.len() {
                        i += 1; // skip final byte
                    }
                }
                b']' => {
                    // OSC sequence: skip until BEL (0x07) or ST (\x1b\\)
                    i += 2;
                    while i < data.len() && data[i] != 0x07 {
                        if data[i] == 0x1b && i + 1 < data.len() && data[i + 1] == b'\\' {
                            i += 2;
                            break;
                        }
                        i += 1;
                    }
                    if i < data.len() && data[i] == 0x07 {
                        i += 1;
                    }
                }
                _ => {
                    // Other escape: skip the next byte
                    i += 2;
                }
            }
        } else if data[i] == 0x0d {
            // Skip carriage return (keep \n only)
            i += 1;
        } else {
            result.push(data[i]);
            i += 1;
        }
    }
    result
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
    /// Tracks last piped output hash per "sourceId:targetId" to avoid re-piping identical data.
    pipe_hashes: Mutex<HashMap<String, u64>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            instances: Mutex::new(HashMap::new()),
            pipe_hashes: Mutex::new(HashMap::new()),
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

        // Shared output buffer between reader thread and main thread
        let output_buffer = Arc::new(Mutex::new(OutputBuffer::new()));
        let buffer_clone = output_buffer.clone();

        // Channel for batched output: reader pushes chunks, flush thread emits
        let (tx, rx) = std::sync::mpsc::channel::<Vec<u8>>();

        // Dedicated OS thread for reading PTY output.
        let app_exit = app.clone();
        std::thread::Builder::new()
            .name(format!("pty-reader-{}", &id[..8]))
            .spawn(move || {
                let mut buf = [0u8; 4096];
                loop {
                    match reader.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            let chunk = buf[..n].to_vec();
                            if let Ok(mut ob) = buffer_clone.lock() {
                                ob.push(&chunk);
                            }
                            if tx.send(chunk).is_err() {
                                break; // Flush thread dropped
                            }
                        }
                        Err(e) => {
                            log::debug!("pty reader {thread_id}: {e}");
                            break;
                        }
                    }
                }
                let _ = app_exit.emit(&exit_event, &thread_id);
            })
            .map_err(|e| format!("reader thread spawn failed: {e}"))?;

        // Flush thread: batches output and emits at ~60fps to reduce IPC overhead.
        let flush_event = output_event.clone();
        std::thread::Builder::new()
            .name(format!("pty-flush-{}", &id[..8]))
            .spawn(move || {
                use std::sync::mpsc::RecvTimeoutError;
                use std::time::Duration;

                let coalesce = Duration::from_millis(16); // ~60fps min batch window
                let timeout = Duration::from_millis(150); // max wait for first byte
                let mut batch: Vec<u8> = Vec::with_capacity(8192);

                loop {
                    // Wait for first chunk (blocks up to 150ms)
                    match rx.recv_timeout(timeout) {
                        Ok(chunk) => {
                            batch.extend_from_slice(&chunk);
                            // Drain all queued chunks
                            while let Ok(more) = rx.try_recv() {
                                batch.extend_from_slice(&more);
                            }
                        }
                        Err(RecvTimeoutError::Timeout) => continue,
                        Err(RecvTimeoutError::Disconnected) => break,
                    }

                    // Emit batch
                    if !batch.is_empty() {
                        let payload = std::mem::take(&mut batch);
                        if app.emit(&flush_event, payload).is_err() {
                            break;
                        }
                    }

                    // Brief sleep to coalesce rapid follow-up output
                    std::thread::sleep(coalesce);
                }
            })
            .map_err(|e| format!("flush thread spawn failed: {e}"))?;

        let info = PtyInfo {
            id: id.clone(),
            label: label.clone(),
        };

        let instance = PtyInstance {
            writer,
            master: pair.master,
            child,
            label,
            output_buffer,
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

        // Flush immediately for low latency.
        instance
            .writer
            .flush()
            .map_err(|e| format!("flush failed: {e}"))?;

        Ok(())
    }

    /// Read the last output from a PTY's ring buffer.
    pub fn read_output(&self, id: &str) -> Result<Vec<u8>, String> {
        let instances = self.instances.lock().unwrap();
        let instance = instances
            .get(id)
            .ok_or_else(|| format!("PTY {id} not found"))?;
        let mut buf = instance.output_buffer.lock().unwrap();
        Ok(buf.read_all().to_vec())
    }

    /// Read last output from source PTY and write it as input to target PTY.
    /// Returns the number of bytes piped. Deduplicates: won't re-pipe if output hasn't changed.
    pub fn pipe_output(&self, source_id: &str, target_id: &str) -> Result<usize, String> {
        // Read source output
        let raw_output = self.read_output(source_id)?;
        if raw_output.is_empty() {
            return Ok(0);
        }

        // Check if output changed since last pipe for this pair
        let pipe_key = format!("{source_id}:{target_id}");
        let output_hash = {
            use std::hash::{Hash, Hasher};
            let mut hasher = std::collections::hash_map::DefaultHasher::new();
            raw_output.hash(&mut hasher);
            hasher.finish()
        };

        {
            let hashes = self.pipe_hashes.lock().unwrap();
            if let Some(&prev_hash) = hashes.get(&pipe_key) {
                if prev_hash == output_hash {
                    return Ok(0); // Output unchanged, skip
                }
            }
        }

        // Strip ANSI escapes for clean text
        let clean = strip_ansi_escapes(&raw_output);
        if clean.is_empty() {
            return Ok(0);
        }

        // Write to target PTY
        self.write(target_id, &clean)?;

        // Update hash
        self.pipe_hashes
            .lock()
            .unwrap()
            .insert(pipe_key, output_hash);

        Ok(clean.len())
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
    pub fn kill(&self, id: &str) -> Result<(), String> {
        let mut instances = self.instances.lock().unwrap();
        if let Some(mut inst) = instances.remove(id) {
            inst.child.kill().ok();
            inst.child.wait().ok(); // reap process to prevent zombie
        }
        Ok(())
    }

    /// Kill all PTYs. Called on app shutdown.
    pub fn kill_all(&self) {
        let mut instances = self.instances.lock().unwrap();
        for (_, mut inst) in instances.drain() {
            inst.child.kill().ok();
            inst.child.wait().ok(); // reap process to prevent zombie
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
