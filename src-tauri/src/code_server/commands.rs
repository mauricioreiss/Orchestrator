use tauri::State;

use super::{CodeServerManager, CodeServerStatus};

#[tauri::command]
pub fn start_code_server(
    app: tauri::AppHandle,
    state: State<'_, CodeServerManager>,
    port: u16,
    workspace: String,
    binary_path: Option<String>,
) -> Result<CodeServerStatus, String> {
    state.start(app, port, workspace, binary_path)
}

#[tauri::command]
pub fn stop_code_server(state: State<'_, CodeServerManager>) {
    state.stop();
}

#[tauri::command]
pub fn code_server_status(state: State<'_, CodeServerManager>) -> CodeServerStatus {
    state.status()
}
