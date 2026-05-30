use crate::commands::config::current_unix_secs;
use crate::models::{App, AppState};
use tauri::State;

#[tauri::command]
pub fn add_app(
    name: String,
    path: String,
    category_id: String,
    item_type: Option<String>,
    state: State<AppState>,
) -> Result<App, String> {
    let mut config = state.config.lock().unwrap();
    let item_type = item_type.unwrap_or_else(|| "app".to_string());
    let app_id = uuid::Uuid::new_v4().to_string();

    let icon = if item_type == "app" {
        crate::utils::icon_extractor::extract_icon_to_file(&path, &app_id).ok()
    } else {
        None
    };

    let app = App {
        id: app_id,
        name,
        path,
        category: category_id.clone(),
        item_type,
        icon,
        last_launched: None,
        created_at: current_unix_secs(),
        update_metadata: None,
        validation_status: None,
        last_validated_at: None,
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

        if let Some(ref icon_filename) = app.icon {
            if !icon_filename.starts_with("data:") {
                let icon_path = crate::utils::config::get_icon_path(icon_filename);
                let _ = std::fs::remove_file(icon_path);
            }
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
pub fn get_icons_dir() -> String {
    crate::utils::config::get_icons_dir()
        .to_string_lossy()
        .to_string()
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
pub fn resolve_shortcut(lnk_path: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use windows::core::Interface;
        use windows::core::{HSTRING, PCWSTR};
        use windows::Win32::Storage::FileSystem::WIN32_FIND_DATAW;
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
            COINIT_APARTMENTTHREADED,
        };
        use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

            let shell_link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
                .map_err(|e| format!("无法创建 ShellLink: {}", e))?;

            let persist_file: windows::Win32::System::Com::IPersistFile = shell_link
                .cast()
                .map_err(|e| format!("无法获取 IPersistFile: {}", e))?;

            let wide_path = HSTRING::from(&lnk_path);
            persist_file
                .Load(
                    PCWSTR(wide_path.as_ptr()),
                    windows::Win32::System::Com::STGM(0),
                )
                .map_err(|e| format!("无法加载快捷方式: {}", e))?;

            let mut path_buf = [0u16; 260];
            let mut find_data = WIN32_FIND_DATAW::default();
            shell_link
                .GetPath(&mut path_buf, &mut find_data, 0)
                .map_err(|e| format!("无法获取目标路径: {}", e))?;

            CoUninitialize();

            let path_len = path_buf
                .iter()
                .position(|&c| c == 0)
                .unwrap_or(path_buf.len());
            let path = String::from_utf16(&path_buf[..path_len])
                .map_err(|e| format!("路径编码转换失败: {}", e))?;

            if path.is_empty() {
                return Err("无法获取快捷方式目标路径".to_string());
            }

            Ok(path)
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("快捷方式解析仅支持 Windows".to_string())
    }
}

#[tauri::command]
pub fn check_app_exists(path: String, state: State<AppState>) -> bool {
    let config = state.config.lock().unwrap();
    config
        .apps
        .values()
        .any(|app| app.path.to_lowercase() == path.to_lowercase())
}

#[tauri::command]
pub fn launch_app_as_admin(app_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;

        Command::new("powershell")
            .args(&[
                "-NoProfile",
                "-Command",
                &format!("Start-Process '{}' -Verb RunAs", app_path),
            ])
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|e| format!("以管理员身份启动失败: {}", e))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        return Err("管理员启动仅支持 Windows".to_string());
    }

    Ok(())
}
