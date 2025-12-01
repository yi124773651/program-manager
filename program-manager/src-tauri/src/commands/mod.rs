use crate::models::{App, AppState, Category, Config};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

#[tauri::command]
pub fn load_config(state: State<AppState>) -> Result<Config, String> {
    let config = state.config.lock().unwrap();
    Ok(config.clone())
}

#[tauri::command]
pub fn save_config(config: Config, state: State<AppState>) -> Result<(), String> {
    let mut current_config = state.config.lock().unwrap();
    *current_config = config.clone();
    crate::utils::config::save_config(&config).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_category(name: String, state: State<AppState>) -> Result<Category, String> {
    let mut config = state.config.lock().unwrap();

    let category = Category {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        icon: None,
        apps: Vec::new(),
        order: config.categories.len(),
    };

    config.categories.insert(category.id.clone(), category.clone());
    crate::utils::config::save_config(&config).map_err(|e| e.to_string())?;
    Ok(category)
}

#[tauri::command]
pub fn add_app(
    name: String,
    path: String,
    category_id: String,
    state: State<AppState>,
) -> Result<App, String> {
    let mut config = state.config.lock().unwrap();

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // 提取图标
    let icon = crate::utils::icon_extractor::extract_icon_from_exe(&path).ok();

    let app = App {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        path,
        category: category_id.clone(),
        icon,
        last_launched: None,
        created_at: now,
    };

    config.apps.insert(app.id.clone(), app.clone());

    if let Some(category) = config.categories.get_mut(&category_id) {
        category.apps.push(app.id.clone());
    }

    crate::utils::config::save_config(&config).map_err(|e| e.to_string())?;
    Ok(app)
}

#[tauri::command]
pub fn delete_app(app_id: String, state: State<AppState>) -> Result<(), String> {
    let mut config = state.config.lock().unwrap();

    if let Some(app) = config.apps.remove(&app_id) {
        if let Some(category) = config.categories.get_mut(&app.category) {
            category.apps.retain(|id| id != &app_id);
        }
    }

    crate::utils::config::save_config(&config).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn launch_app(app_id: String, state: State<AppState>) -> Result<(), String> {
    let config = state.config.lock().unwrap();

    let app = config
        .apps
        .get(&app_id)
        .ok_or_else(|| "应用不存在".to_string())?;

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;

        const CREATE_NO_WINDOW: u32 = 0x08000000;

        Command::new("cmd")
            .args(&["/C", "start", "", &app.path])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("启动失败: {}", e))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::process::Command;
        Command::new("open")
            .arg(&app.path)
            .spawn()
            .map_err(|e| format!("启动失败: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn extract_icon(exe_path: String) -> Result<String, String> {
    crate::utils::icon_extractor::extract_icon_from_exe(&exe_path)
}

#[tauri::command]
pub fn open_file_location(file_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("explorer")
            .args(&["/select,", &file_path])
            .spawn()
            .map_err(|e| format!("打开文件位置失败: {}", e))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::process::Command;
        let parent = std::path::Path::new(&file_path)
            .parent()
            .ok_or("无法获取父目录")?;
        Command::new("open")
            .arg(parent)
            .spawn()
            .map_err(|e| format!("打开文件位置失败: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn register_context_menu() -> Result<(), String> {
    // 获取当前可执行文件的路径
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("无法获取执行文件路径: {}", e))?;

    let exe_path_str = exe_path
        .to_str()
        .ok_or_else(|| "无法转换执行文件路径".to_string())?;

    crate::utils::registry::register_context_menu(exe_path_str)
}

#[tauri::command]
pub fn unregister_context_menu() -> Result<(), String> {
    crate::utils::registry::unregister_context_menu()
}

#[tauri::command]
pub fn is_context_menu_registered() -> bool {
    crate::utils::registry::is_context_menu_registered()
}

/// 解析 .lnk 快捷方式文件，返回目标路径
#[tauri::command]
pub fn resolve_shortcut(lnk_path: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use lnk::ShellLink;

        let shortcut = ShellLink::open(&lnk_path)
            .map_err(|e| format!("无法打开快捷方式: {:?}", e))?;

        // 获取目标路径
        if let Some(target) = shortcut.relative_path() {
            // 相对路径需要结合工作目录
            let lnk_dir = std::path::Path::new(&lnk_path)
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_default();
            let full_path = lnk_dir.join(target);
            if full_path.exists() {
                return Ok(full_path.to_string_lossy().to_string());
            }
        }

        // 尝试获取绝对路径
        if let Some(link_info) = shortcut.link_info() {
            if let Some(local_path) = link_info.local_base_path() {
                return Ok(local_path.to_string());
            }
        }

        Err("无法获取快捷方式目标路径".to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("快捷方式解析仅支持 Windows".to_string())
    }
}

/// 检查应用是否已存在（根据路径）
#[tauri::command]
pub fn check_app_exists(path: String, state: State<AppState>) -> bool {
    let config = state.config.lock().unwrap();
    config.apps.values().any(|app| {
        app.path.to_lowercase() == path.to_lowercase()
    })
}
