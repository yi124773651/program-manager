use crate::models::{AppSettings, Config};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

fn shortcut_value(value: &Option<String>, default_value: &str) -> String {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(default_value)
        .replace("Ctrl+", "Control+")
}

fn parse_shortcut(value: &str, label: &str) -> Result<Shortcut, String> {
    value
        .parse::<Shortcut>()
        .map_err(|error| format!("{} 快捷键格式无效（{}）: {}", label, value, error))
}

fn should_register_quicker_shortcuts(settings: &AppSettings) -> bool {
    settings.quicker_enabled.unwrap_or(true)
}

pub fn register_configured_shortcuts(app: &AppHandle, config: &Config) -> Result<(), String> {
    let shortcut_manager = app.global_shortcut();
    shortcut_manager
        .unregister_all()
        .map_err(|error| format!("清理旧快捷键失败: {}", error))?;

    let settings = &config.settings;
    if !should_register_quicker_shortcuts(settings) {
        return Ok(());
    }

    if settings.global_shortcut_enabled.unwrap_or(true) {
        let shortcut_text = shortcut_value(&settings.global_shortcut, "Alt+Space");
        let shortcut = parse_shortcut(&shortcut_text, "主窗口")?;
        shortcut_manager
            .on_shortcut(shortcut, move |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    toggle_main_window(app);
                }
            })
            .map_err(|error| format!("注册主窗口快捷键失败（{}）: {}", shortcut_text, error))?;
    }

    if settings.spotlight_search_enabled.unwrap_or(true) {
        let shortcut_text = shortcut_value(&settings.spotlight_shortcut, "Control+K");
        let shortcut = parse_shortcut(&shortcut_text, "快捷搜索")?;
        shortcut_manager
            .on_shortcut(shortcut, move |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    show_or_create_search_window(app);
                }
            })
            .map_err(|error| format!("注册快捷搜索快捷键失败（{}）: {}", shortcut_text, error))?;
    }

    if settings.quick_notes_enabled.unwrap_or(true) {
        let shortcut_text = shortcut_value(&settings.quick_notes_shortcut, "Alt+N");
        let shortcut = parse_shortcut(&shortcut_text, "快捷便签")?;
        shortcut_manager
            .on_shortcut(shortcut, move |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    show_or_create_notes_window(app);
                }
            })
            .map_err(|error| format!("注册快捷便签快捷键失败（{}）: {}", shortcut_text, error))?;
    }

    if settings.todo_schedule_enabled.unwrap_or(true) {
        let shortcut_text = shortcut_value(&settings.todo_shortcut, "Alt+T");
        let shortcut = parse_shortcut(&shortcut_text, "待办日程表")?;
        shortcut_manager
            .on_shortcut(shortcut, move |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    toggle_or_create_todo_window(app);
                }
            })
            .map_err(|error| format!("注册待办日程表快捷键失败（{}）: {}", shortcut_text, error))?;
    }

    Ok(())
}

pub fn reload_shortcuts_or_restore(
    app: &AppHandle,
    next_config: &Config,
    previous_config: &Config,
) -> Result<(), String> {
    if let Err(error) = register_configured_shortcuts(app, next_config) {
        let restore_result = register_configured_shortcuts(app, previous_config);
        if let Err(restore_error) = restore_result {
            return Err(format!("{}；恢复旧快捷键也失败: {}", error, restore_error));
        }

        return Err(format!("{}；已恢复旧快捷键设置", error));
    }

    Ok(())
}

fn toggle_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().unwrap_or(false);
        let is_minimized = window.is_minimized().unwrap_or(false);

        if is_visible && !is_minimized {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }
}

fn show_or_create_search_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("search") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let url = if cfg!(debug_assertions) {
        WebviewUrl::External("http://localhost:1420/search.html".parse().unwrap())
    } else {
        WebviewUrl::App("search.html".into())
    };

    let _ = WebviewWindowBuilder::new(app, "search", url)
        .title("快捷搜索")
        .inner_size(600.0, 68.0)
        .max_inner_size(600.0, 500.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .center()
        .skip_taskbar(true)
        .build();
}

pub fn show_or_create_notes_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("notes") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

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

fn toggle_or_create_todo_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("todo") {
        let is_visible = window.is_visible().unwrap_or(false);
        let is_minimized = window.is_minimized().unwrap_or(false);

        if is_visible && !is_minimized {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
        return;
    }

    let url = if cfg!(debug_assertions) {
        WebviewUrl::External("http://localhost:1420/todo.html".parse().unwrap())
    } else {
        WebviewUrl::App("todo.html".into())
    };

    let _ = WebviewWindowBuilder::new(app, "todo", url)
        .title("待办日程表")
        .inner_size(820.0, 620.0)
        .min_inner_size(680.0, 520.0)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .center()
        .build();
}

pub fn show_or_create_todo_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("todo") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return;
    }

    let url = if cfg!(debug_assertions) {
        WebviewUrl::External("http://localhost:1420/todo.html".parse().unwrap())
    } else {
        WebviewUrl::App("todo.html".into())
    };

    let _ = WebviewWindowBuilder::new(app, "todo", url)
        .title("待办日程表")
        .inner_size(820.0, 620.0)
        .min_inner_size(680.0, 520.0)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .center()
        .build();
}
