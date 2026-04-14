use std::collections::HashMap;
use std::io::BufRead;
use std::net::TcpStream;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use uuid::Uuid;

use super::models::{CodeServerDetection, CodeServerInstance, CodeServerStatus, IsolationMode};

/// Manages multiple VS Code web server instances (one per VSCodeNode).
///
/// Uses `code serve-web` (VS Code built-in) instead of code-server.
/// Each instance binds to 127.0.0.1:{port} with a unique connection token.
pub struct CodeServerManager {
    instances: Mutex<HashMap<String, CodeServerInstance>>,
    next_port: Mutex<u16>,
}

impl CodeServerManager {
    pub fn new() -> Self {
        Self {
            instances: Mutex::new(HashMap::new()),
            next_port: Mutex::new(13370),
        }
    }

    /// Detect VS Code binary on Windows.
    /// Checks PATH via `where.exe code`, then standard install location.
    pub fn detect_binary() -> CodeServerDetection {
        // 1. Check PATH
        if let Ok(output) = Command::new("where.exe")
            .arg("code")
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let path = stdout
                    .lines()
                    .find(|l| l.trim().ends_with("code.cmd"))
                    .or_else(|| stdout.lines().next())
                    .unwrap_or("")
                    .trim()
                    .to_string();

                if !path.is_empty() {
                    return CodeServerDetection {
                        found: true,
                        path: Some(path),
                        source: Some("path".into()),
                    };
                }
            }
        }

        // 2. Fallback: standard install via %LOCALAPPDATA%
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            let standard = format!(
                r"{}\Programs\Microsoft VS Code\bin\code.cmd",
                local
            );
            if std::path::Path::new(&standard).exists() {
                return CodeServerDetection {
                    found: true,
                    path: Some(standard),
                    source: Some("standard".into()),
                };
            }
        }

        CodeServerDetection {
            found: false,
            path: None,
            source: None,
        }
    }

    /// Start a VS Code web server for a specific VSCodeNode.
    ///
    /// Security: binds only to 127.0.0.1 with a unique UUID connection token.
    /// The frontend must include `?tkn={token}` in the iframe URL.
    pub fn start(
        &self,
        instance_id: String,
        workspace: Option<String>,
        binary_path: Option<String>,
    ) -> Result<CodeServerStatus, String> {
        let mut instances = self.instances.lock().unwrap();

        if instances.contains_key(&instance_id) {
            return Err(format!(
                "VS Code server already running for instance {instance_id}"
            ));
        }

        let primary_binary = binary_path.unwrap_or_else(|| "code".into());
        let port = self.allocate_port(&instances);
        let token = Uuid::new_v4().to_string();
        let url = format!("http://127.0.0.1:{port}");
        let ws = workspace.unwrap_or_default();
        let isolation = IsolationMode::default();
        println!("[maestri-x] Starting VS Code server {instance_id} on port {port} (isolation: {isolation:?})");

        // Strategy: try Code.exe directly (stays alive), then .cmd fallback
        let mut child = Self::spawn_serve_web(&primary_binary, port, &ws)
            .or_else(|e| {
                println!("[maestri-x] Primary binary '{primary_binary}' failed: {e}");
                // Fallback: standard Windows install path via %LOCALAPPDATA%
                if let Ok(local) = std::env::var("LOCALAPPDATA") {
                    let fallback = format!(r"{}\Programs\Microsoft VS Code\bin\code.cmd", local);
                    if std::path::Path::new(&fallback).exists() {
                        println!("[maestri-x] Trying fallback: {fallback}");
                        return Self::spawn_serve_web(&fallback, port, &ws);
                    }
                }
                Err(e)
            })
            .map_err(|e| format!("failed to start VS Code serve-web: {e}"))?;

        // Drain stderr in a background thread to prevent pipe deadlock
        let stderr_buf = Arc::new(Mutex::new(String::new()));
        let stderr_clone = stderr_buf.clone();
        if let Some(stderr) = child.stderr.take() {
            std::thread::Builder::new()
                .name(format!("vscode-stderr-{}", &instance_id[..8.min(instance_id.len())]))
                .spawn(move || {
                    let reader = std::io::BufReader::new(stderr);
                    for line in reader.lines() {
                        match line {
                            Ok(l) => {
                                log::debug!("code serve-web stderr: {l}");
                                if let Ok(mut buf) = stderr_clone.lock() {
                                    if buf.len() < 8192 {
                                        buf.push_str(&l);
                                        buf.push('\n');
                                    }
                                }
                            }
                            Err(_) => break,
                        }
                    }
                })
                .ok();
        }

        let status = CodeServerStatus {
            instance_id: instance_id.clone(),
            running: true,
            ready: false,
            port,
            url: url.clone(),
            workspace: ws.clone(),
            token: token.clone(),
            error_output: None,
        };

        instances.insert(
            instance_id,
            CodeServerInstance {
                process: child,
                port,
                workspace: ws,
                url,
                token,
                stderr: stderr_buf,
                isolation,
                launcher_exited: false,
            },
        );

        Ok(status)
    }

    /// Stop a specific VS Code server instance.
    pub fn stop(&self, instance_id: &str) -> Result<(), String> {
        let mut instances = self.instances.lock().unwrap();
        if let Some(mut inst) = instances.remove(instance_id) {
            log::debug!("Stopping VS Code server {instance_id} (port {}, isolation: {:?})", inst.port, inst.isolation);
            if inst.launcher_exited {
                // The .cmd wrapper exited but server runs detached — kill by port
                Self::kill_by_port(inst.port);
            } else {
                inst.process.kill().ok();
                inst.process.wait().ok();
            }
            Ok(())
        } else {
            Err(format!("no VS Code server instance {instance_id}"))
        }
    }

    /// Stop all instances. Called on app shutdown.
    pub fn stop_all(&self) {
        let mut instances = self.instances.lock().unwrap();
        for (_, mut inst) in instances.drain() {
            if inst.launcher_exited {
                Self::kill_by_port(inst.port);
            } else {
                inst.process.kill().ok();
                inst.process.wait().ok();
            }
        }
    }

    /// Check status of a specific instance. Includes TCP readiness check.
    pub fn status(&self, instance_id: &str) -> CodeServerStatus {
        let mut instances = self.instances.lock().unwrap();

        if let Some(inst) = instances.get_mut(instance_id) {
            // If the launcher (.cmd) already exited, skip try_wait and go straight to TCP
            if inst.launcher_exited {
                let ready = Self::tcp_check(inst.port);
                if ready {
                    return CodeServerStatus {
                        instance_id: instance_id.to_string(),
                        running: true,
                        ready: true,
                        port: inst.port,
                        url: inst.url.clone(),
                        workspace: inst.workspace.clone(),
                        token: inst.token.clone(),
                        error_output: None,
                    };
                } else {
                    // Server actually died
                    let workspace = inst.workspace.clone();
                    instances.remove(instance_id);
                    println!("[maestri-x] Detached VS Code server {instance_id} is no longer reachable");
                    return CodeServerStatus {
                        instance_id: instance_id.to_string(),
                        running: false,
                        ready: false,
                        port: 0,
                        url: String::new(),
                        workspace,
                        token: String::new(),
                        error_output: Some("Server stopped responding".into()),
                    };
                }
            }

            match inst.process.try_wait() {
                Ok(None) => {
                    // Process alive — check if HTTP server is accepting connections
                    let ready = Self::tcp_check(inst.port);

                    CodeServerStatus {
                        instance_id: instance_id.to_string(),
                        running: true,
                        ready,
                        port: inst.port,
                        url: inst.url.clone(),
                        workspace: inst.workspace.clone(),
                        token: inst.token.clone(),
                        error_output: None,
                    }
                }
                Ok(Some(exit_status)) => {
                    // Process exited. If exit code 0, the .cmd launcher may have
                    // exited while the real server continues running on the port.
                    if exit_status.success() {
                        // Wait a bit for server to fully bind, then check TCP
                        std::thread::sleep(Duration::from_millis(500));
                        let ready = Self::tcp_check(inst.port);
                        if ready {
                            println!(
                                "[maestri-x] VS Code launcher exited (code 0) but server is alive on port {} — switching to TCP-only tracking",
                                inst.port
                            );
                            inst.launcher_exited = true;
                            return CodeServerStatus {
                                instance_id: instance_id.to_string(),
                                running: true,
                                ready: true,
                                port: inst.port,
                                url: inst.url.clone(),
                                workspace: inst.workspace.clone(),
                                token: inst.token.clone(),
                                error_output: None,
                            };
                        }
                    }

                    // Process actually died
                    std::thread::sleep(Duration::from_millis(100));
                    let stderr_output = inst.stderr.lock().ok().map(|s| s.clone());
                    let workspace = inst.workspace.clone();
                    let port = inst.port;
                    instances.remove(instance_id);

                    let exit_info = format!("exit code: {}", exit_status);
                    let error_msg = match &stderr_output {
                        Some(s) if !s.is_empty() => Some(format!("{exit_info} | stderr: {s}")),
                        _ => Some(exit_info),
                    };
                    println!("[maestri-x] VS Code server {instance_id} died (port {port}): {}", error_msg.as_deref().unwrap_or("unknown"));

                    CodeServerStatus {
                        instance_id: instance_id.to_string(),
                        running: false,
                        ready: false,
                        port: 0,
                        url: String::new(),
                        workspace,
                        token: String::new(),
                        error_output: error_msg,
                    }
                }
                Err(e) => {
                    // try_wait error — treat as dead
                    let workspace = inst.workspace.clone();
                    instances.remove(instance_id);
                    println!("[maestri-x] VS Code server {instance_id} try_wait error: {e}");
                    CodeServerStatus {
                        instance_id: instance_id.to_string(),
                        running: false,
                        ready: false,
                        port: 0,
                        url: String::new(),
                        workspace,
                        token: String::new(),
                        error_output: Some(format!("process check failed: {e}")),
                    }
                }
            }
        } else {
            CodeServerStatus {
                instance_id: instance_id.to_string(),
                running: false,
                ready: false,
                port: 0,
                url: String::new(),
                workspace: String::new(),
                token: String::new(),
                error_output: None,
            }
        }
    }

    /// List all active instances. Tokens are masked for security.
    pub fn list(&self) -> Vec<CodeServerStatus> {
        let instances = self.instances.lock().unwrap();
        instances
            .iter()
            .map(|(id, inst)| CodeServerStatus {
                instance_id: id.clone(),
                running: true,
                ready: false, // List doesn't check readiness
                port: inst.port,
                url: inst.url.clone(),
                workspace: inst.workspace.clone(),
                token: mask_token(&inst.token),
                error_output: None,
            })
            .collect()
    }

    /// Spawn a `code serve-web` process.
    ///
    /// Strategy:
    /// 1. If binary is a .cmd/.bat wrapper, resolve Code.exe and call it directly.
    ///    This keeps the process alive (the .cmd wrapper would exit immediately).
    /// 2. Fallback: call the binary as-is.
    fn spawn_serve_web(binary: &str, port: u16, ws: &str) -> std::io::Result<std::process::Child> {
        let lower = binary.to_lowercase();

        // For .cmd/.bat wrappers: resolve Code.exe and call it directly.
        // code.cmd sets ELECTRON_RUN_AS_NODE=1 and calls Code.exe with cli.js.
        // The batch script exits immediately after launching — Rust loses the handle.
        // By calling Code.exe directly, Rust owns the actual server process.
        if lower.ends_with(".cmd") || lower.ends_with(".bat") {
            if let Some(child) = Self::try_spawn_code_exe(binary, port, ws) {
                return Ok(child);
            }
            println!("[maestri-x] Could not resolve Code.exe, falling back to .cmd wrapper");
        }

        // Direct call (for non-.cmd binaries or fallback)
        let mut cmd = Command::new(binary);
        cmd.arg("serve-web")
            .args(["--host", "127.0.0.1"])
            .args(["--port", &port.to_string()])
            .arg("--without-connection-token")
            .arg("--accept-server-license-terms")
            .arg("--disable-telemetry")
            .arg("--do-not-sync")
            .stdout(Stdio::null())
            .stderr(Stdio::piped());

        if let Some(parent) = std::path::Path::new(binary).parent() {
            if parent.exists() {
                cmd.current_dir(parent);
            }
        }

        if !ws.is_empty() {
            cmd.args(["--default-folder", ws]);
        }

        let mut repr = format!("{binary} serve-web --host 127.0.0.1 --port {port} --without-connection-token --accept-server-license-terms --disable-telemetry --do-not-sync");
        if !ws.is_empty() {
            repr.push_str(&format!(" --default-folder \"{ws}\""));
        }
        println!("[maestri-x] spawn_serve_web (fallback .cmd): {repr}");

        cmd.spawn()
    }

    /// Resolve Code.exe from a code.cmd path and spawn it directly.
    ///
    /// Layout: {vscode_root}/bin/code.cmd → Code.exe is at {vscode_root}/Code.exe
    /// cli.js is at {vscode_root}/resources/app/out/cli.js
    fn try_spawn_code_exe(cmd_path: &str, port: u16, ws: &str) -> Option<std::process::Child> {
        let bin_dir = std::path::Path::new(cmd_path).parent()?;
        let vscode_root = bin_dir.parent()?;

        let code_exe = vscode_root.join("Code.exe");
        let cli_js = vscode_root.join("resources").join("app").join("out").join("cli.js");

        if !code_exe.exists() {
            println!("[maestri-x] Code.exe not found at {}", code_exe.display());
            return None;
        }
        if !cli_js.exists() {
            println!("[maestri-x] cli.js not found at {}", cli_js.display());
            return None;
        }

        let mut cmd = Command::new(&code_exe);
        cmd.arg(&cli_js)
            .arg("serve-web")
            .args(["--host", "127.0.0.1"])
            .args(["--port", &port.to_string()])
            .arg("--without-connection-token")
            .arg("--accept-server-license-terms")
            .arg("--disable-telemetry")
            .arg("--do-not-sync")
            .env("ELECTRON_RUN_AS_NODE", "1")
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .current_dir(vscode_root);

        if !ws.is_empty() {
            cmd.args(["--default-folder", ws]);
        }

        let mut repr = format!(
            "\"{}\" \"{}\" serve-web --host 127.0.0.1 --port {} --without-connection-token --accept-server-license-terms --disable-telemetry --do-not-sync",
            code_exe.display(), cli_js.display(), port
        );
        if !ws.is_empty() {
            repr.push_str(&format!(" --default-folder \"{ws}\""));
        }
        println!("[maestri-x] spawn Code.exe directly: ELECTRON_RUN_AS_NODE=1 {repr}");

        match cmd.spawn() {
            Ok(child) => {
                println!("[maestri-x] Code.exe spawned (PID: {})", child.id());
                Some(child)
            }
            Err(e) => {
                println!("[maestri-x] Code.exe spawn failed: {e}");
                None
            }
        }
    }

    /// TCP readiness check against 127.0.0.1:{port}.
    fn tcp_check(port: u16) -> bool {
        TcpStream::connect_timeout(
            &format!("127.0.0.1:{port}").parse().unwrap(),
            Duration::from_millis(500),
        )
        .is_ok()
    }

    /// Kill a process listening on a specific port (Windows).
    /// Used when the .cmd launcher exited but the server runs detached.
    #[cfg(target_os = "windows")]
    fn kill_by_port(port: u16) {
        let port_str = format!(":{port}");
        if let Ok(output) = Command::new("cmd")
            .args(["/C", "netstat", "-ano", "-p", "TCP"])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains(&port_str) && line.contains("LISTENING") {
                    if let Some(pid_str) = line.split_whitespace().last() {
                        if let Ok(pid) = pid_str.parse::<u32>() {
                            println!("[maestri-x] Killing detached server PID {pid} on port {port}");
                            Command::new("taskkill")
                                .args(["/F", "/PID", &pid.to_string()])
                                .stdout(Stdio::null())
                                .stderr(Stdio::null())
                                .output()
                                .ok();
                            return;
                        }
                    }
                }
            }
        }
        println!("[maestri-x] No process found listening on port {port}");
    }

    #[cfg(not(target_os = "windows"))]
    fn kill_by_port(port: u16) {
        // On Linux/macOS: fuser or lsof
        Command::new("fuser")
            .args(["-k", &format!("{port}/tcp")])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .output()
            .ok();
    }

    fn allocate_port(&self, instances: &HashMap<String, CodeServerInstance>) -> u16 {
        let mut next = self.next_port.lock().unwrap();
        let used_ports: Vec<u16> = instances.values().map(|i| i.port).collect();

        loop {
            let port = *next;
            *next = if port >= 13399 { 13370 } else { port + 1 };
            if !used_ports.contains(&port) {
                return port;
            }
        }
    }
}

/// Show only first 8 chars of a token for log/list safety.
fn mask_token(token: &str) -> String {
    if token.len() > 8 {
        format!("{}...", &token[..8])
    } else {
        token.to_string()
    }
}
