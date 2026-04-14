use tauri::State;

use super::models::PtyInfo;
use super::services::PtyManager;

#[tauri::command]
pub fn spawn_pty(
    app: tauri::AppHandle,
    state: State<'_, PtyManager>,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    label: Option<String>,
) -> Result<PtyInfo, String> {
    println!("[maestri-x] spawn_pty called (cols={cols}, rows={rows}, cwd={cwd:?})");
    state.spawn(app, cols, rows, cwd, label)
}

#[tauri::command]
pub fn write_pty(
    state: State<'_, PtyManager>,
    id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    state.write(&id, &data)
}

#[tauri::command]
pub fn resize_pty(
    state: State<'_, PtyManager>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state.resize(&id, cols, rows)
}

#[tauri::command]
pub fn kill_pty(
    state: State<'_, PtyManager>,
    id: String,
) -> Result<(), String> {
    state.kill(&id)
}

#[tauri::command]
pub fn list_ptys(state: State<'_, PtyManager>) -> Vec<PtyInfo> {
    state.list()
}

#[tauri::command]
pub fn read_pty_output(
    state: State<'_, PtyManager>,
    id: String,
) -> Result<Vec<u8>, String> {
    state.read_output(&id)
}

#[tauri::command]
pub fn pipe_pty_output(
    state: State<'_, PtyManager>,
    source_id: String,
    target_id: String,
) -> Result<usize, String> {
    state.pipe_output(&source_id, &target_id)
}
