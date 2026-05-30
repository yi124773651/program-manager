use tauri::Manager;

#[tauri::command]
pub fn register_context_menu() -> Result<(), String> {
    let exe_path = std::env::current_exe().map_err(|e| format!("无法获取执行文件路径: {}", e))?;

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

#[tauri::command]
pub fn hide_todo_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("todo")
        .ok_or_else(|| "待办窗口不存在".to_string())?;

    window
        .hide()
        .map_err(|e| format!("隐藏待办窗口失败: {}", e))
}

#[tauri::command]
pub fn hide_main_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;

    window.hide().map_err(|e| format!("隐藏主窗口失败: {}", e))
}

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub fn show_notes_window(app: tauri::AppHandle) -> Result<(), String> {
    crate::utils::shortcuts::show_or_create_notes_window(&app);
    Ok(())
}

#[tauri::command]
pub fn show_todo_window(app: tauri::AppHandle) -> Result<(), String> {
    crate::utils::shortcuts::show_or_create_todo_window(&app);
    Ok(())
}
