use super::models::{VaultContent, VaultFile, VaultSearchResult};
use super::services::VaultManager;

#[tauri::command]
pub fn list_vault_files(
    vault_root: String,
    subfolder: Option<String>,
) -> Result<Vec<VaultFile>, String> {
    VaultManager::list_files(&vault_root, subfolder.as_deref())
}

#[tauri::command]
pub fn read_vault_file(
    vault_root: String,
    relative_path: String,
) -> Result<VaultContent, String> {
    VaultManager::read_file(&vault_root, &relative_path)
}

#[tauri::command]
pub fn search_vault(
    vault_root: String,
    query: String,
) -> Result<Vec<VaultFile>, String> {
    VaultManager::search(&vault_root, &query)
}

#[tauri::command]
pub fn search_vault_content(
    vault_root: String,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<VaultSearchResult>, String> {
    if query.len() < 2 {
        return Err("query must be at least 2 characters".into());
    }
    VaultManager::search_content(&vault_root, &query, max_results)
}
