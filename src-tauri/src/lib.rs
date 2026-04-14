mod pty;
mod code_server;
mod context;
mod persistence;
mod supervisor;
mod translator;
mod vault;

use tauri::Manager;

/// IPC handshake: frontend calls this to verify the Tauri bridge is alive.
#[tauri::command]
fn ping() -> String {
    println!("[maestri-x] PING received from frontend — IPC bridge is working");
    "pong".to_string()
}

pub fn run() {
    println!("[maestri-x] Backend starting...");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(pty::PtyManager::new())
        .manage(code_server::CodeServerManager::new())
        .manage(context::ContextManager::new())
        .manage(supervisor::ProcessSupervisor::new())
        .manage(translator::TranslatorService::new())
        .setup(|app| {
            println!("[maestri-x] Setup phase: initializing persistence...");

            // Initialize SQLite persistence in app data directory
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("failed to resolve app data dir: {e}"))?;

            let persistence = persistence::PersistenceManager::new(data_dir)
                .map_err(|e| format!("persistence init failed: {e}"))?;

            app.manage(persistence);

            println!("[maestri-x] Setup complete. Opening window...");

            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // IPC handshake
            ping,
            // PTY lifecycle
            pty::commands::spawn_pty,
            pty::commands::write_pty,
            pty::commands::resize_pty,
            pty::commands::kill_pty,
            pty::commands::list_ptys,
            pty::commands::read_pty_output,
            pty::commands::pipe_pty_output,
            // code-server lifecycle
            code_server::commands::detect_code_server,
            code_server::commands::start_code_server,
            code_server::commands::stop_code_server,
            code_server::commands::code_server_status,
            code_server::commands::list_code_servers,
            // context orchestration
            context::commands::sync_canvas,
            context::commands::send_interrupt,
            // process supervisor
            supervisor::commands::cleanup_nodes,
            // vault (Obsidian connector)
            vault::commands::list_vault_files,
            vault::commands::read_vault_file,
            vault::commands::search_vault,
            vault::commands::search_vault_content,
            // persistence
            persistence::commands::save_canvas,
            persistence::commands::load_canvas,
            persistence::commands::list_canvases,
            persistence::commands::delete_canvas,
            // settings
            persistence::commands::get_setting,
            persistence::commands::set_setting,
            persistence::commands::get_all_settings,
            // translator (AI command translation)
            translator::commands::translate_and_inject,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let pty_mgr = window.state::<pty::PtyManager>();
                pty_mgr.kill_all();

                let cs_mgr = window.state::<code_server::CodeServerManager>();
                cs_mgr.stop_all();
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run maestri-x");
}
