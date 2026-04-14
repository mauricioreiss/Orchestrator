use std::sync::{Arc, Mutex};

use serde::Serialize;

/// Status of a single VS Code web server instance.
#[derive(Serialize, Clone)]
pub struct CodeServerStatus {
    pub instance_id: String,
    pub running: bool,
    /// True when HTTP server is accepting connections (not just process alive).
    pub ready: bool,
    pub port: u16,
    pub url: String,
    pub workspace: String,
    /// Connection token for iframe auth (?tkn=...).
    /// Masked in list() responses, full in status()/start().
    pub token: String,
    /// Stderr output from the process (for error diagnostics).
    pub error_output: Option<String>,
}

/// Result of detecting VS Code binary on the system.
#[derive(Serialize, Clone)]
pub struct CodeServerDetection {
    pub found: bool,
    pub path: Option<String>,
    /// How the binary was found: "path", "standard"
    pub source: Option<String>,
}

/// Internal state of a running VS Code server process.
pub(crate) struct CodeServerInstance {
    pub process: std::process::Child,
    pub port: u16,
    pub workspace: String,
    pub url: String,
    pub token: String,
    /// Captured stderr from the process (drained by background thread).
    pub stderr: Arc<Mutex<String>>,
    /// How this instance is isolated (Local, Docker, Wasm).
    pub isolation: IsolationMode,
    /// True when the .cmd launcher exited but the server is still alive on the port.
    /// In this state, we skip try_wait() and rely on TCP checks only.
    pub launcher_exited: bool,
}

/// Isolation mode for future container/WASM support.
/// Currently only Local is used.
#[derive(Debug, Clone, Serialize)]
pub enum IsolationMode {
    /// Direct process on host OS (current implementation)
    Local,
    /// Docker container (future)
    #[allow(dead_code)]
    Docker { image: String },
    /// WASM sandbox (future)
    #[allow(dead_code)]
    Wasm,
}

impl Default for IsolationMode {
    fn default() -> Self {
        Self::Local
    }
}
