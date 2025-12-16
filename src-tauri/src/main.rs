// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod models;
mod utils;

use commands::*;
use models::AppState;
use std::sync::Mutex;
use tauri::{Manager, Emitter, WebviewUrl, WebviewWindowBuilder, menu::{MenuBuilder, MenuItemBuilder}};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

fn main() {
    // 加载或创建配置
    let config = utils::config::load_or_create_config();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // 当检测到第二个实例启动时，这个回调会被调用
            println!("Single instance callback triggered with args: {:?}", args);

            // 显示主窗口
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.unminimize();
            }

            // 处理命令行参数（如果有文件路径）
            if args.len() > 1 {
                // args[0] 是可执行文件路径，args[1] 是 "add"，args[2] 是文件路径
                if args.len() >= 3 && args[1] == "add" {
                    let file_path = &args[2];
                    println!("Adding file from context menu: {}", file_path);

                    // 发送事件到前端
                    let _ = app.emit("add-file-from-context-menu", file_path);
                }
            }
        }))
        .manage(AppState {
            config: Mutex::new(config),
        })
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            add_category,
            add_app,
            delete_app,
            launch_app,
            extract_icon,
            get_icons_dir,
            open_file_location,
            register_context_menu,
            unregister_context_menu,
            is_context_menu_registered,
            resolve_shortcut,
            check_app_exists,
            execute_action_template,
            // 应用操作命令
            launch_app_as_admin,
            // 进程检测命令
            is_process_running,
            // 场景动作命令
            send_keys,
            wait_for_window,
        ])
        .setup(|app| {
            // 处理启动时的命令行参数
            let args: Vec<String> = std::env::args().collect();
            println!("App started with args: {:?}", args);

            if args.len() >= 3 && args[1] == "add" {
                let file_path = &args[2];
                println!("Adding file from context menu on startup: {}", file_path);

                // 延迟发送事件，确保前端已经准备好
                let app_handle = app.handle().clone();
                let file_path_clone = file_path.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    let _ = app_handle.emit("add-file-from-context-menu", file_path_clone);
                });
            }

            // 创建托盘菜单
            let show_item = MenuItemBuilder::with_id("show", "显示窗口").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            // 创建托盘图标
            let tray = app.tray_by_id("main-tray").unwrap();
            tray.set_menu(Some(menu))?;

            // 处理托盘事件
            tray.on_menu_event(|app, event| {
                match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        // 强制退出应用
                        std::process::exit(0);
                    }
                    _ => {}
                }
            });

            // 处理托盘图标点击事件（左键点击显示窗口）
            tray.on_tray_icon_event(|tray, event| {
                use tauri::tray::TrayIconEvent;
                match event {
                    TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.unminimize();
                        }
                    }
                    _ => {}
                }
            });

            // 处理窗口关闭事件（最小化到托盘而不是退出）
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        // 阻止默认关闭行为
                        api.prevent_close();
                        // 隐藏窗口到托盘
                        let _ = window_clone.hide();
                    }
                });
            }

            // 注册全局快捷键 Alt+Space 切换窗口显示/隐藏
            let shortcut = "Alt+Space".parse::<Shortcut>().unwrap();
            let app_handle_main = app.handle().clone();
            app.global_shortcut().on_shortcut(shortcut, move |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    // 检查设置是否启用
                    let config = app_handle_main.state::<AppState>();
                    let config_guard = config.config.lock().unwrap();
                    let quicker_enabled = config_guard.settings.quicker_enabled.unwrap_or(true);
                    let global_shortcut_enabled = config_guard.settings.global_shortcut_enabled.unwrap_or(true);
                    drop(config_guard); // 释放锁

                    if !quicker_enabled || !global_shortcut_enabled {
                        return; // 功能被禁用
                    }

                    if let Some(window) = app.get_webview_window("main") {
                        let is_visible = window.is_visible().unwrap_or(false);
                        let is_minimized = window.is_minimized().unwrap_or(false);

                        // 如果窗口可见且没有最小化，则隐藏
                        if is_visible && !is_minimized {
                            let _ = window.hide();
                        } else {
                            // 否则显示窗口（包括从最小化恢复）
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                }
            })?;

            // 注册全局快捷键 Ctrl+K 打开快捷搜索
            let search_shortcut = "Control+K".parse::<Shortcut>().unwrap();
            let app_handle_search = app.handle().clone();
            app.global_shortcut().on_shortcut(search_shortcut, move |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    // 检查设置是否启用
                    let config = app_handle_search.state::<AppState>();
                    let config_guard = config.config.lock().unwrap();
                    let quicker_enabled = config_guard.settings.quicker_enabled.unwrap_or(true);
                    let spotlight_enabled = config_guard.settings.spotlight_search_enabled.unwrap_or(true);
                    drop(config_guard); // 释放锁

                    if !quicker_enabled || !spotlight_enabled {
                        return; // 功能被禁用，不打开窗口
                    }

                    // 检查搜索窗口是否已存在
                    if let Some(window) = app.get_webview_window("search") {
                        // 窗口已存在，聚焦它
                        let _ = window.show();
                        let _ = window.set_focus();
                    } else {
                        // 创建新的搜索窗口
                        let url = if cfg!(debug_assertions) {
                            WebviewUrl::External("http://localhost:1420/search.html".parse().unwrap())
                        } else {
                            WebviewUrl::App("search.html".into())
                        };

                        let _ = WebviewWindowBuilder::new(app, "search", url)
                            .title("快捷搜索")
                            .inner_size(600.0, 68.0)  // 初始只显示搜索框高度
                            .max_inner_size(600.0, 500.0)
                            .resizable(false)
                            .decorations(false)
                            .transparent(true)
                            .always_on_top(true)
                            .center()
                            .skip_taskbar(true)
                            .build();
                    }
                }
            })?;

            // 注册全局快捷键 Alt+N 打开快捷便签
            let notes_shortcut = "Alt+N".parse::<Shortcut>().unwrap();
            let app_handle_notes = app.handle().clone();
            app.global_shortcut().on_shortcut(notes_shortcut, move |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    // 检查设置是否启用
                    let config = app_handle_notes.state::<AppState>();
                    let config_guard = config.config.lock().unwrap();
                    let quicker_enabled = config_guard.settings.quicker_enabled.unwrap_or(true);
                    let notes_enabled = config_guard.settings.quick_notes_enabled.unwrap_or(true);
                    drop(config_guard); // 释放锁

                    if !quicker_enabled || !notes_enabled {
                        return; // 功能被禁用，不打开窗口
                    }

                    // 检查便签窗口是否已存在
                    if let Some(window) = app.get_webview_window("notes") {
                        // 窗口已存在，聚焦它
                        let _ = window.show();
                        let _ = window.set_focus();
                    } else {
                        // 创建新的便签窗口
                        let url = if cfg!(debug_assertions) {
                            WebviewUrl::External("http://localhost:1420/notes.html".parse().unwrap())
                        } else {
                            WebviewUrl::App("notes.html".into())
                        };

                        let _ = WebviewWindowBuilder::new(app, "notes", url)
                            .title("快捷便签")
                            .inner_size(700.0, 500.0)
                            .resizable(true)
                            .min_inner_size(500.0, 400.0)
                            .decorations(false)
                            .transparent(true)
                            .always_on_top(true)
                            .center()
                            .build();
                    }
                }
            })?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
