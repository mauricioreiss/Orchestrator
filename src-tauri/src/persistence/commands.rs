use tauri::State;

use super::models::{CanvasSummary, SavedCanvas};
use super::services::PersistenceManager;

/// Save canvas state to SQLite.
#[tauri::command]
pub fn save_canvas(
    state: State<'_, PersistenceManager>,
    id: String,
    name: String,
    data: String,
) -> Result<(), String> {
    println!("[maestri-x] save_canvas called (id={id})");
    state.save(&id, &name, &data)
}

/// Load a canvas by ID.
#[tauri::command]
pub fn load_canvas(
    state: State<'_, PersistenceManager>,
    id: String,
) -> Result<Option<SavedCanvas>, String> {
    println!("[maestri-x] load_canvas called (id={id})");
    state.load(&id)
}

/// List all saved canvases.
#[tauri::command]
pub fn list_canvases(
    state: State<'_, PersistenceManager>,
) -> Result<Vec<CanvasSummary>, String> {
    state.list()
}

/// Delete a canvas.
#[tauri::command]
pub fn delete_canvas(
    state: State<'_, PersistenceManager>,
    id: String,
) -> Result<(), String> {
    state.delete(&id)
}

/// Get a setting value by key.
#[tauri::command]
pub fn get_setting(
    state: State<'_, PersistenceManager>,
    key: String,
) -> Result<Option<String>, String> {
    state.get_setting(&key)
}

/// Set a setting value (upsert).
#[tauri::command]
pub fn set_setting(
    state: State<'_, PersistenceManager>,
    key: String,
    value: String,
) -> Result<(), String> {
    state.set_setting(&key, &value)
}

/// Get all settings as key-value pairs.
#[tauri::command]
pub fn get_all_settings(
    state: State<'_, PersistenceManager>,
) -> Result<Vec<(String, String)>, String> {
    state.get_all_settings()
}
