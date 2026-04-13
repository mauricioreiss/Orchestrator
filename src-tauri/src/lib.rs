mod pty;
mod code_server;
mod context;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .manage(pty::PtyManager::new())
        .manage(code_server::CodeServerManager::new())
        .manage(context::ContextManager::new())
        .invoke_handler(tauri::generate_handler![
            // PTY lifecycle
            pty::commands::spawn_pty,
            pty::commands::write_pty,
            pty::commands::resize_pty,
            pty::commands::kill_pty,
            pty::commands::list_ptys,
            // code-server lifecycle
            code_server::commands::start_code_server,
            code_server::commands::stop_code_server,
            code_server::commands::code_server_status,
            // context orchestration
            context::commands::sync_canvas,
            context::commands::send_interrupt,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Cleanup: kill all PTYs and code-server on window close
                let pty_mgr = window.state::<pty::PtyManager>();
                pty_mgr.kill_all();

                let cs_mgr = window.state::<code_server::CodeServerManager>();
                cs_mgr.stop();
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run maestri-x");
}
