use tauri::State;

use super::models::{AiProvider, TranslateResult};
use super::services::TranslatorService;
use crate::persistence::PersistenceManager;
use crate::pty::PtyManager;

/// Translate a natural language note into a shell command and inject it into the PTY.
///
/// Flow:
/// 1. Read AI provider settings from SQLite
/// 2. Call AI API to translate note → command
/// 3. Write the command + newline to the target PTY
/// 4. Return the translated command to frontend
#[tauri::command]
pub async fn translate_and_inject(
    translator: State<'_, TranslatorService>,
    persistence: State<'_, PersistenceManager>,
    pty: State<'_, PtyManager>,
    note_content: String,
    pty_id: String,
    cwd: String,
    role: String,
) -> Result<TranslateResult, String> {
    // Read settings (sync, brief mutex locks)
    let provider_str = persistence
        .get_setting("translator_provider")?
        .unwrap_or_else(|| "openai".to_string());
    let api_key = persistence
        .get_setting("translator_api_key")?
        .ok_or_else(|| "API key not configured. Open Settings to add your key.".to_string())?;
    let model_setting = persistence.get_setting("translator_model")?;

    let provider = AiProvider::from_str(&provider_str);
    let model_name = model_setting
        .as_deref()
        .unwrap_or(provider.default_model())
        .to_string();

    println!(
        "[maestri-x] translate_and_inject: provider={provider_str}, model={model_name}, pty={pty_id}"
    );

    // Async: call AI API
    let command = translator
        .translate(
            &provider,
            &api_key,
            Some(&model_name),
            &note_content,
            &cwd,
            &role,
        )
        .await?;

    println!("[maestri-x] Translated command: {command}");

    // Write translated command to PTY (auto-execute with \r\n)
    let inject = format!("{}\r\n", command.trim());
    pty.write(&pty_id, inject.as_bytes())?;

    Ok(TranslateResult {
        command: command.trim().to_string(),
        provider: provider_str,
        model: model_name,
    })
}
