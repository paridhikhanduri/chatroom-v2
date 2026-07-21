use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::Manager;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

struct ServerProcess(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let resource_dir = app.path().resource_dir()?;
            let scenarios = resource_dir.join("resources").join("scenarios.json");
            let public = resource_dir.join("resources").join("public");

            let (mut rx, child) = app
                .shell()
                .sidecar("chatroom-server")?
                .env("CHATROOM_SCENARIOS_PATH", scenarios.to_string_lossy().to_string())
                .env("CHATROOM_PUBLIC_PATH", public.to_string_lossy().to_string())
                .env("PORT", "4141")
                .spawn()?;

            app.manage(ServerProcess(Mutex::new(Some(child))));

            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(l) => log::info!("[server] {}", String::from_utf8_lossy(&l)),
                        CommandEvent::Stderr(l) => log::error!("[server] {}", String::from_utf8_lossy(&l)),
                        CommandEvent::Terminated(p) => log::error!("[server] exited: {:?}", p),
                        _ => {}
                    }
                }
            });

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("chat-room");
                std::thread::spawn(move || {
                    if wait_for_port("127.0.0.1:4141", Duration::from_secs(15)) {
                        let url = tauri::Url::parse("http://127.0.0.1:4141").unwrap();
                        let _ = window.navigate(url);
                    } else {
                        log::error!("server never came up on :4141");
                    }
                });
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                if let Some(state) = app.try_state::<ServerProcess>() {
                    if let Some(child) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        });
}

fn wait_for_port(addr: &str, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if std::net::TcpStream::connect(addr).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    false
}