use tauri::State;

use super::models::{CodeServerDetection, CodeServerStatus};
use super::services::CodeServerManager;

/// Detect if VS Code is installed (for `code serve-web`).
#[tauri::command]
pub fn detect_code_server() -> CodeServerDetection {
    println!("[maestri-x] detect_code_server called");
    let result = CodeServerManager::detect_binary();
    println!("[maestri-x] detect_code_server result: found={}, path={:?}", result.found, result.path);
    result
}

/// Start a VS Code web server instance for a specific VSCodeNode.
#[tauri::command]
pub fn start_code_server(
    state: State<'_, CodeServerManager>,
    instance_id: String,
    workspace: Option<String>,
    binary_path: Option<String>,
) -> Result<CodeServerStatus, String> {
    println!("[maestri-x] start_code_server called (id={instance_id}, ws={workspace:?}, bin={binary_path:?})");
    state.start(instance_id, workspace, binary_path)
}

/// Stop a specific VS Code server instance.
#[tauri::command]
pub fn stop_code_server(
    state: State<'_, CodeServerManager>,
    instance_id: String,
) -> Result<(), String> {
    state.stop(&instance_id)
}

/// Get status of a specific VS Code server instance (includes full token).
#[tauri::command]
pub fn code_server_status(
    state: State<'_, CodeServerManager>,
    instance_id: String,
) -> CodeServerStatus {
    state.status(&instance_id)
}

/// List all active VS Code server instances (tokens masked).
#[tauri::command]
pub fn list_code_servers(state: State<'_, CodeServerManager>) -> Vec<CodeServerStatus> {
    state.list()
}
