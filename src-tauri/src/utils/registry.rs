#[cfg(target_os = "windows")]
use std::io::ErrorKind;
#[cfg(target_os = "windows")]
use std::path::Path;
#[cfg(target_os = "windows")]
use winreg::enums::*;
#[cfg(target_os = "windows")]
use winreg::RegKey;

#[cfg(target_os = "windows")]
const CONTEXT_MENU_KEY: &str = r"Software\Classes\*\shell\AddToProgramManager";
#[cfg(target_os = "windows")]
const CONTEXT_MENU_PARENT_KEY: &str = r"Software\Classes\*\shell";

#[cfg(target_os = "windows")]
fn validate_executable_path(exe_path: &str) -> Result<String, String> {
    if exe_path.is_empty()
        || exe_path.len() > 4096
        || exe_path.contains('"')
        || exe_path.chars().any(|character| character.is_control())
    {
        return Err("程序路径包含非法字符".to_string());
    }

    let path = Path::new(exe_path);
    if !path.is_absolute()
        || !path.is_file()
        || !path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
    {
        return Err("程序路径必须指向真实的绝对 EXE 文件".to_string());
    }

    path.canonicalize()
        .map(|path| path.to_string_lossy().to_string())
        .map_err(|error| format!("规范化程序路径失败: {}", error))
}

/// 注册 Windows 右键菜单，只写入当前用户的固定菜单键。
#[cfg(target_os = "windows")]
pub fn register_context_menu(exe_path: &str) -> Result<(), String> {
    let exe_path = validate_executable_path(exe_path)?;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    let (key, _) = hkcu
        .create_subkey(CONTEXT_MENU_KEY)
        .map_err(|error| format!("创建注册表项失败: {}", error))?;

    key.set_value("", &"添加到程序管理器")
        .map_err(|error| format!("设置菜单文本失败: {}", error))?;
    key.set_value("Icon", &exe_path)
        .map_err(|error| format!("设置图标失败: {}", error))?;

    let (command_key, _) = hkcu
        .create_subkey(format!(r"{}\command", CONTEXT_MENU_KEY))
        .map_err(|error| format!("创建命令项失败: {}", error))?;
    command_key
        .set_value("", &format!(r#""{}" add "%1""#, exe_path))
        .map_err(|error| format!("设置命令失败: {}", error))?;

    Ok(())
}

/// 注销操作保持幂等，目标键不存在时视为成功。
#[cfg(target_os = "windows")]
pub fn unregister_context_menu() -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = match hkcu.open_subkey_with_flags(CONTEXT_MENU_PARENT_KEY, KEY_WRITE) {
        Ok(key) => key,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("打开注册表项失败: {}", error)),
    };

    match key.delete_subkey_all("AddToProgramManager") {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("删除注册表项失败: {}", error)),
    }
}

#[cfg(target_os = "windows")]
pub fn is_context_menu_registered() -> bool {
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(CONTEXT_MENU_KEY)
        .is_ok()
}

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

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::validate_executable_path;

    #[test]
    fn 右键菜单只接受真实的绝对_exe路径() {
        let current_exe = std::env::current_exe().expect("应能获取测试程序路径");
        assert!(validate_executable_path(&current_exe.to_string_lossy()).is_ok());
        assert!(validate_executable_path(r"relative\program-manager.exe").is_err());
        assert!(validate_executable_path(r#"C:\Tools\bad"name.exe"#).is_err());
        assert!(validate_executable_path(r"C:\Tools\program-manager.txt").is_err());
    }
}
