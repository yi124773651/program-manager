use crate::utils::{audit, system};
use serde::Serialize;
use std::path::Path;
use std::time::Instant;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionResult {
    pub success: bool,
    pub output: String,
    pub error_output: String,
    pub exit_code: i32,
    pub execution_time: u64,
}

fn success_result(output: impl Into<String>, started_at: Instant) -> ActionResult {
    ActionResult {
        success: true,
        output: output.into(),
        error_output: String::new(),
        exit_code: 0,
        execution_time: started_at.elapsed().as_millis() as u64,
    }
}

fn failure_result(error: impl Into<String>, started_at: Instant) -> ActionResult {
    ActionResult {
        success: false,
        output: String::new(),
        error_output: error.into(),
        exit_code: -1,
        execution_time: started_at.elapsed().as_millis() as u64,
    }
}

#[tauri::command]
pub fn is_process_running(process_name: String) -> Result<bool, String> {
    system::is_process_running(&process_name)
}

#[tauri::command]
pub fn close_process(process_name: String, confirmed: bool) -> Result<ActionResult, String> {
    if !confirmed {
        return Err("结束进程需要用户明确确认".to_string());
    }
    let started_at = Instant::now();
    let audit_id = audit::start_action("scene", "close_process", &process_name, confirmed)?;
    let result =
        system::close_process(&process_name).map(|count| format!("已结束 {} 个进程", count));
    audit::finish_action(
        &audit_id,
        "scene",
        "close_process",
        &process_name,
        confirmed,
        &result,
    )?;
    Ok(match result {
        Ok(output) => success_result(output, started_at),
        Err(error) => failure_result(error, started_at),
    })
}

#[tauri::command]
pub fn send_keys(keys: String, confirmed: bool) -> Result<(), String> {
    if !confirmed {
        return Err("发送按键需要用户明确确认".to_string());
    }
    let audit_id = audit::start_action("scene", "send_keys", "active-window", confirmed)?;
    let result = system::send_keys(&keys).map(|_| "已发送按键".to_string());
    audit::finish_action(
        &audit_id,
        "scene",
        "send_keys",
        "active-window",
        confirmed,
        &result,
    )?;
    result.map(|_| ())
}

#[tauri::command]
pub fn wait_for_window(title: String, timeout_secs: u32) -> Result<bool, String> {
    system::wait_for_window(&title, timeout_secs)
}

#[tauri::command]
pub fn activate_process_window(process_name: String) -> Result<bool, String> {
    system::activate_process_window(&process_name)
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    system::open_url(&url)
}

#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    system::open_folder(&path)
}

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    system::open_file(&path)
}

#[tauri::command]
pub fn show_notification(app: AppHandle, title: String, body: String) -> Result<(), String> {
    if title.trim().is_empty()
        || title.chars().count() > 80
        || title.chars().any(|character| character.is_control())
    {
        return Err("通知标题无效".to_string());
    }
    if body.trim().is_empty()
        || body.chars().count() > 500
        || body.chars().any(|character| character.is_control())
    {
        return Err("通知内容无效".to_string());
    }

    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|error| format!("发送通知失败: {}", error))
}

/// 执行固定动作 ID，不接受脚本源码，避免形成通用脚本执行入口。
#[tauri::command]
pub fn execute_app_action(
    action_id: String,
    app_path: String,
    confirmed: bool,
) -> Result<ActionResult, String> {
    if matches!(action_id.as_str(), "run_as_admin" | "kill_process") && !confirmed {
        return Err("高风险应用动作需要用户明确确认".to_string());
    }
    let started_at = Instant::now();
    let audit_id = if matches!(action_id.as_str(), "run_as_admin" | "kill_process") {
        Some(audit::start_action(
            "app-card", &action_id, &app_path, confirmed,
        )?)
    } else {
        None
    };
    let result = match action_id.as_str() {
        "run_as_admin" => {
            system::launch_as_admin(&app_path).map(|_| "已请求管理员启动".to_string())
        }
        "kill_process" => {
            let process_name = Path::new(&app_path)
                .file_stem()
                .and_then(|value| value.to_str())
                .ok_or_else(|| "无法从路径确定进程名".to_string())?;
            system::close_process(process_name).map(|count| format!("已结束 {} 个进程", count))
        }
        _ => Err("动作不存在或已被禁用".to_string()),
    };

    if let Some(audit_id) = audit_id {
        audit::finish_action(
            &audit_id, "app-card", &action_id, &app_path, confirmed, &result,
        )?;
    }

    Ok(match result {
        Ok(output) => success_result(output, started_at),
        Err(error) => failure_result(error, started_at),
    })
}
