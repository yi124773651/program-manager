use crate::models::{App, AppState, Category, Config};
use serde::Serialize;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::State;

/// 动作执行结果
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionResult {
    pub success: bool,
    pub output: String,
    pub error_output: String,
    pub exit_code: i32,
    pub execution_time: u64,
}

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

    // 生成应用 ID
    let app_id = uuid::Uuid::new_v4().to_string();

    // 提取图标并保存到文件（新方式）
    let icon = crate::utils::icon_extractor::extract_icon_to_file(&path, &app_id).ok();

    let app = App {
        id: app_id,
        name,
        path,
        category: category_id.clone(),
        icon,
        last_launched: None,
        created_at: now,
        // 维护功能新增字段
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

        // 删除图标文件
        if let Some(ref icon_filename) = app.icon {
            // 如果是文件名格式（不是 base64），删除文件
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

/// 获取图标目录路径
#[tauri::command]
pub fn get_icons_dir() -> String {
    crate::utils::config::get_icons_dir().to_string_lossy().to_string()
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

/// 以管理员身份运行应用
#[tauri::command]
pub fn launch_app_as_admin(app_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;

        // 使用 runas 动词以管理员身份运行
        Command::new("powershell")
            .args(&[
                "-NoProfile",
                "-Command",
                &format!("Start-Process '{}' -Verb RunAs", app_path)
            ])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn()
            .map_err(|e| format!("以管理员身份启动失败: {}", e))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        return Err("管理员启动仅支持 Windows".to_string());
    }

    Ok(())
}

/// 检查进程是否正在运行
#[tauri::command]
pub fn is_process_running(process_name: String) -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;

        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // 使用 tasklist 检查进程
        let output = Command::new("tasklist")
            .args(&["/FI", &format!("IMAGENAME eq {}.exe", process_name), "/NH"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                // 如果输出包含进程名，说明进程正在运行
                stdout.to_lowercase().contains(&process_name.to_lowercase())
            }
            Err(_) => false,
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

/// 发送键盘按键
#[tauri::command]
pub fn send_keys(keys: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;

        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // 使用 PowerShell SendKeys 发送按键
        let script = format!(
            r#"
Add-Type -AssemblyName System.Windows.Forms
Start-Sleep -Milliseconds 100
[System.Windows.Forms.SendKeys]::SendWait("{}")
"#,
            keys
        );

        Command::new("powershell")
            .args(&["-NoProfile", "-Command", &script])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("发送按键失败: {}", e))?;

        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("发送按键仅支持 Windows".to_string())
    }
}

/// 等待窗口出现
#[tauri::command]
pub fn wait_for_window(title: String, timeout_secs: u32) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        use std::time::{Duration, Instant};

        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let start = Instant::now();
        let timeout = Duration::from_secs(timeout_secs as u64);

        // 轮询检测窗口是否存在
        while start.elapsed() < timeout {
            let script = format!(
                r#"
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WindowHelper {{
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public static bool found = false;
    public static string searchTitle = "";

    public static bool EnumWindowsCallback(IntPtr hWnd, IntPtr lParam) {{
        if (!IsWindowVisible(hWnd)) return true;
        StringBuilder sb = new StringBuilder(256);
        GetWindowText(hWnd, sb, 256);
        string title = sb.ToString();
        if (!string.IsNullOrEmpty(title) && title.IndexOf(searchTitle, StringComparison.OrdinalIgnoreCase) >= 0) {{
            found = true;
            return false;
        }}
        return true;
    }}

    public static bool FindWindowByTitle(string title) {{
        found = false;
        searchTitle = title;
        EnumWindows(EnumWindowsCallback, IntPtr.Zero);
        return found;
    }}
}}
"@
if ([WindowHelper]::FindWindowByTitle("{}")) {{ "FOUND" }} else {{ "NOTFOUND" }}
"#,
                title
            );

            let output = Command::new("powershell")
                .args(&["-NoProfile", "-Command", &script])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .map_err(|e| format!("检测窗口失败: {}", e))?;

            let stdout = String::from_utf8_lossy(&output.stdout);
            if stdout.contains("FOUND") {
                return Ok(true);
            }

            // 等待 500ms 后重试
            std::thread::sleep(Duration::from_millis(500));
        }

        Ok(false)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("等待窗口仅支持 Windows".to_string())
    }
}

/// 执行动作模板（用于场景功能）
#[tauri::command]
pub fn execute_action_template(
    script_content: String,
    app_path: String,
    app_name: String,
) -> Result<ActionResult, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;

        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let start_time = Instant::now();

        // 设置 UTF-8 编码以避免乱码
        let utf8_script = format!(
            "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; {}",
            script_content
        );

        let output = Command::new("powershell")
            .args(&["-NoProfile", "-Command", &utf8_script])
            .env("APP_PATH", &app_path)
            .env("APP_NAME", &app_name)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("执行失败: {}", e))?;

        let execution_time = start_time.elapsed().as_millis() as u64;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code().unwrap_or(-1);
        let success = output.status.success();

        Ok(ActionResult {
            success,
            output: stdout,
            error_output: stderr,
            exit_code,
            execution_time,
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("动作模板执行仅支持 Windows".to_string())
    }
}

// ============ 程序维护相关命令 ============

/// 验证结果
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub app_id: String,
    pub app_name: String,
    pub is_valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path_type: Option<String>,
}

/// 更新检测详情
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckDetails {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_version: Option<String>,
    pub file_changed: bool,
    pub size_changed: bool,
    pub modified_time_changed: bool,
}

/// 更新检测结果
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub app_id: String,
    pub app_name: String,
    pub has_update: bool,
    pub confidence: String,
    pub details: UpdateCheckDetails,
}

/// 批量操作结果
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchOperationResult {
    pub total: usize,
    pub completed: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub errors: Vec<ErrorInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorInfo {
    pub app_id: String,
    pub error: String,
}

/// 批量验证所有程序
#[tauri::command]
pub fn validate_all_apps(state: State<AppState>) -> Result<Vec<ValidationResult>, String> {
    let config = state.config.lock().unwrap();
    let mut results = Vec::new();

    for (app_id, app) in &config.apps {
        let (is_valid, reason, path_type) =
            crate::utils::app_validator::validate_app_path(&app.path);

        results.push(ValidationResult {
            app_id: app_id.clone(),
            app_name: app.name.clone(),
            is_valid,
            reason,
            path_type,
        });
    }

    Ok(results)
}

/// 为单个程序初始化基准数据
#[tauri::command]
pub fn init_update_baseline(app_id: String, state: State<AppState>) -> Result<(), String> {
    use crate::models::UpdateMetadata;

    let mut config = state.config.lock().unwrap();
    let app = config
        .apps
        .get_mut(&app_id)
        .ok_or_else(|| "应用不存在".to_string())?;

    // 获取文件元数据
    let (size, modified_time) = crate::utils::app_validator::get_file_metadata(&app.path)
        .ok_or_else(|| "无法读取文件元数据".to_string())?;

    // 尝试从注册表获取版本号（Windows only）
    #[cfg(target_os = "windows")]
    let version = crate::utils::update_checker::get_version_from_registry(&app.path);

    #[cfg(not(target_os = "windows"))]
    let version: Option<String> = None;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    app.update_metadata = Some(UpdateMetadata {
        baseline_version: version,
        baseline_file_size: Some(size),
        baseline_modified_time: Some(modified_time),
        last_checked_at: Some(now),
        update_status: Some("none".to_string()),
        update_confidence: None,
    });

    crate::utils::config::save_config(&config).map_err(|e| e.to_string())?;
    Ok(())
}

/// 批量初始化所有程序的基准数据
#[tauri::command]
pub fn init_all_baselines(state: State<AppState>) -> Result<BatchOperationResult, String> {
    use crate::models::UpdateMetadata;

    let mut config = state.config.lock().unwrap();
    let total = config.apps.len();
    let mut completed = 0;
    let mut succeeded = 0;
    let mut errors = Vec::new();

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    for (app_id, app) in config.apps.iter_mut() {
        completed += 1;

        // 跳过已初始化的
        if app.update_metadata.is_some() {
            succeeded += 1;
            continue;
        }

        // 初始化基准数据
        if let Some((size, modified_time)) =
            crate::utils::app_validator::get_file_metadata(&app.path)
        {
            #[cfg(target_os = "windows")]
            let version = crate::utils::update_checker::get_version_from_registry(&app.path);

            #[cfg(not(target_os = "windows"))]
            let version: Option<String> = None;

            app.update_metadata = Some(UpdateMetadata {
                baseline_version: version,
                baseline_file_size: Some(size),
                baseline_modified_time: Some(modified_time),
                last_checked_at: Some(now),
                update_status: Some("none".to_string()),
                update_confidence: None,
            });
            succeeded += 1;
        } else {
            errors.push(ErrorInfo {
                app_id: app_id.clone(),
                error: "无法读取文件元数据".to_string(),
            });
        }
    }

    crate::utils::config::save_config(&config).map_err(|e| e.to_string())?;

    Ok(BatchOperationResult {
        total,
        completed,
        succeeded,
        failed: errors.len(),
        errors,
    })
}

/// 检测单个程序更新
#[tauri::command]
pub fn check_app_update(app_id: String, state: State<AppState>) -> Result<UpdateCheckResult, String> {
    let config = state.config.lock().unwrap();
    let app = config
        .apps
        .get(&app_id)
        .ok_or_else(|| "应用不存在".to_string())?;

    let metadata = app.update_metadata.as_ref();
    let baseline_version = metadata.and_then(|m| m.baseline_version.clone());
    let baseline_size = metadata.and_then(|m| m.baseline_file_size);
    let baseline_modified_time = metadata.and_then(|m| m.baseline_modified_time);

    let result = crate::utils::update_checker::check_for_update(
        &app.path,
        baseline_version,
        baseline_size,
        baseline_modified_time,
    );

    Ok(UpdateCheckResult {
        app_id: app_id.clone(),
        app_name: app.name.clone(),
        has_update: result.has_update,
        confidence: result.confidence,
        details: UpdateCheckDetails {
            old_version: result.old_version,
            new_version: result.new_version,
            file_changed: result.file_changed,
            size_changed: result.size_changed,
            modified_time_changed: result.modified_time_changed,
        },
    })
}

/// 批量检测所有程序更新
#[tauri::command]
pub fn check_all_updates(state: State<AppState>) -> Result<Vec<UpdateCheckResult>, String> {
    let config = state.config.lock().unwrap();
    let mut results = Vec::new();

    for (app_id, app) in &config.apps {
        let metadata = app.update_metadata.as_ref();
        let baseline_version = metadata.and_then(|m| m.baseline_version.clone());
        let baseline_size = metadata.and_then(|m| m.baseline_file_size);
        let baseline_modified_time = metadata.and_then(|m| m.baseline_modified_time);

        let result = crate::utils::update_checker::check_for_update(
            &app.path,
            baseline_version,
            baseline_size,
            baseline_modified_time,
        );

        results.push(UpdateCheckResult {
            app_id: app_id.clone(),
            app_name: app.name.clone(),
            has_update: result.has_update,
            confidence: result.confidence,
            details: UpdateCheckDetails {
                old_version: result.old_version,
                new_version: result.new_version,
                file_changed: result.file_changed,
                size_changed: result.size_changed,
                modified_time_changed: result.modified_time_changed,
            },
        });
    }

    Ok(results)
}

/// 批量删除程序
#[tauri::command]
pub fn batch_delete_apps(app_ids: Vec<String>, state: State<AppState>) -> Result<BatchOperationResult, String> {
    let mut config = state.config.lock().unwrap();
    let total = app_ids.len();
    let mut completed = 0;
    let mut succeeded = 0;
    let mut errors = Vec::new();

    for app_id in app_ids {
        completed += 1;

        if let Some(app) = config.apps.remove(&app_id) {
            // 从分类中移除
            for category in config.categories.values_mut() {
                category.apps.retain(|id| id != &app_id);
            }

            // 删除图标文件
            if let Some(ref icon_filename) = app.icon {
                if !icon_filename.starts_with("data:") {
                    let icon_path = crate::utils::config::get_icon_path(icon_filename);
                    let _ = std::fs::remove_file(icon_path);
                }
            }

            succeeded += 1;
        } else {
            errors.push(ErrorInfo {
                app_id: app_id.clone(),
                error: "应用不存在".to_string(),
            });
        }
    }

    crate::utils::config::save_config(&config).map_err(|e| e.to_string())?;

    Ok(BatchOperationResult {
        total,
        completed,
        succeeded,
        failed: errors.len(),
        errors,
    })
}
