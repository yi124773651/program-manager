#[cfg(target_os = "windows")]
use winreg::enums::*;
#[cfg(target_os = "windows")]
use winreg::RegKey;

/// 注册 Windows 右键菜单
#[cfg(target_os = "windows")]
pub fn register_context_menu(exe_path: &str) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = r"Software\Classes\*\shell\AddToProgramManager";

    // 创建主菜单项
    let (key, _) = hkcu
        .create_subkey(path)
        .map_err(|e| format!("创建注册表项失败: {}", e))?;

    key.set_value("", &"添加到程序管理器")
        .map_err(|e| format!("设置菜单文本失败: {}", e))?;

    key.set_value("Icon", &exe_path)
        .map_err(|e| format!("设置图标失败: {}", e))?;

    // 创建命令
    let (command_key, _) = hkcu
        .create_subkey(format!("{}\\command", path))
        .map_err(|e| format!("创建命令项失败: {}", e))?;

    command_key
        .set_value("", &format!(r#""{}" add "%1""#, exe_path))
        .map_err(|e| format!("设置命令失败: {}", e))?;

    Ok(())
}

/// 注销 Windows 右键菜单
#[cfg(target_os = "windows")]
pub fn unregister_context_menu() -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = r"Software\Classes\*\shell";

    let key = hkcu
        .open_subkey_with_flags(path, KEY_WRITE)
        .map_err(|e| format!("打开注册表项失败: {}", e))?;

    key.delete_subkey_all("AddToProgramManager")
        .map_err(|e| format!("删除注册表项失败: {}", e))?;

    Ok(())
}

/// 检查右键菜单是否已注册
#[cfg(target_os = "windows")]
pub fn is_context_menu_registered() -> bool {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = r"Software\Classes\*\shell\AddToProgramManager";

    hkcu.open_subkey(path).is_ok()
}

// 非 Windows 平台的空实现
#[cfg(not(target_os = "windows"))]
pub fn register_context_menu(_exe_path: &str) -> Result<(), String> {
    Err("此功能仅在 Windows 平台可用".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn unregister_context_menu() -> Result<(), String> {
    Err("此功能仅在 Windows 平台可用".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn is_context_menu_registered() -> bool {
    false
}
