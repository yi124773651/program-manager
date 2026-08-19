//! Windows 系统操作封装。
//!
//! 所有路径、URL、进程和按键参数都在进入系统 API 前完成基本校验，避免通过
//! cmd.exe 或 PowerShell 拼接脚本执行用户输入。

#[cfg(target_os = "windows")]
use std::ffi::OsStr;
#[cfg(target_os = "windows")]
use std::iter::once;
#[cfg(target_os = "windows")]
use std::mem::{size_of, zeroed};
#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStrExt;
#[cfg(target_os = "windows")]
use std::path::Path;

#[cfg(target_os = "windows")]
use winapi::shared::minwindef::{BOOL, DWORD, LPARAM, UINT};
#[cfg(target_os = "windows")]
use winapi::shared::windef::HWND;
#[cfg(target_os = "windows")]
use winapi::um::handleapi::{CloseHandle, INVALID_HANDLE_VALUE};
#[cfg(target_os = "windows")]
use winapi::um::processthreadsapi::{OpenProcess, TerminateProcess};
#[cfg(target_os = "windows")]
use winapi::um::shellapi::ShellExecuteW;
#[cfg(target_os = "windows")]
use winapi::um::tlhelp32::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
#[cfg(target_os = "windows")]
use winapi::um::winnt::PROCESS_TERMINATE;
#[cfg(target_os = "windows")]
use winapi::um::winuser::{
    EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible, SendInput,
    SetForegroundWindow, INPUT, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE,
    SW_SHOWNORMAL, VK_CONTROL, VK_MENU, VK_SHIFT,
};

#[cfg(target_os = "windows")]
fn wide(value: &str) -> Vec<u16> {
    OsStr::new(value).encode_wide().chain(once(0)).collect()
}

#[cfg(target_os = "windows")]
fn validate_text(value: &str, field: &str, max_len: usize) -> Result<(), String> {
    if value.is_empty() || value.len() > max_len || value.chars().any(|c| c.is_control()) {
        return Err(format!("{}无效", field));
    }
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn validate_process_name(name: &str) -> Result<String, String> {
    validate_text(name, "进程名", 255)?;
    if name.contains(['\\', '/']) {
        return Err("进程名不能包含路径分隔符".to_string());
    }
    let name = Path::new(name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(name)
        .trim();
    if name.is_empty()
        || name.chars().any(|value| {
            !value.is_ascii_alphanumeric() && value != '_' && value != '-' && value != '.'
        })
    {
        return Err("进程名包含非法字符".to_string());
    }
    Ok(name.to_ascii_lowercase())
}

#[cfg(target_os = "windows")]
fn process_entries() -> Vec<(u32, String)> {
    let mut entries = Vec::new();
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return entries;
        }

        let mut entry: PROCESSENTRY32W = zeroed();
        entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
        if Process32FirstW(snapshot, &mut entry) != 0 {
            loop {
                let end = entry
                    .szExeFile
                    .iter()
                    .position(|value| *value == 0)
                    .unwrap_or(entry.szExeFile.len());
                let name = String::from_utf16_lossy(&entry.szExeFile[..end]);
                entries.push((entry.th32ProcessID, name.to_ascii_lowercase()));
                if Process32NextW(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snapshot);
    }
    entries
}

#[cfg(target_os = "windows")]
pub fn process_ids(name: &str) -> Result<Vec<u32>, String> {
    let normalized = validate_process_name(name)?;
    let expected = format!("{}.exe", normalized);
    Ok(process_entries()
        .into_iter()
        .filter_map(|(pid, process_name)| (process_name == expected).then_some(pid))
        .collect())
}

#[cfg(target_os = "windows")]
pub fn is_process_running(name: &str) -> Result<bool, String> {
    Ok(!process_ids(name)?.is_empty())
}

#[cfg(target_os = "windows")]
pub fn close_process(name: &str) -> Result<usize, String> {
    let ids = process_ids(name)?;
    let mut closed = 0;
    unsafe {
        for pid in ids {
            let handle = OpenProcess(PROCESS_TERMINATE, 0, pid);
            if handle.is_null() {
                continue;
            }
            if TerminateProcess(handle, 1) != 0 {
                closed += 1;
            }
            CloseHandle(handle);
        }
    }
    Ok(closed)
}

#[cfg(target_os = "windows")]
pub fn open_with_shell(path_or_url: &str, verb: Option<&str>) -> Result<(), String> {
    validate_text(path_or_url, "目标", 4096)?;
    let file = wide(path_or_url);
    let operation = wide(verb.unwrap_or("open"));
    unsafe {
        let result = ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            file.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        );
        if (result as usize) <= 32 {
            return Err(format!("无法打开目标（错误码 {}）", result as usize));
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn validate_local_path(value: &str, field: &str) -> Result<(), String> {
    validate_text(value, field, 4096)?;
    if value.contains('"')
        || value
            .chars()
            .any(|character| matches!(character, '<' | '>' | '|' | '*' | '?'))
        || !Path::new(value).is_absolute()
    {
        return Err(format!("{}必须是有效的绝对路径", field));
    }
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn open_url(url: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "网址格式无效".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err("仅支持 http 或 https 网址".to_string());
    }
    open_with_shell(url, Some("open"))
}

#[cfg(target_os = "windows")]
pub fn open_folder(path: &str) -> Result<(), String> {
    validate_local_path(path, "文件夹路径")?;
    open_with_shell(path, Some("open"))
}

#[cfg(target_os = "windows")]
pub fn open_file(path: &str) -> Result<(), String> {
    validate_local_path(path, "文件路径")?;
    open_with_shell(path, Some("open"))
}

#[cfg(target_os = "windows")]
pub fn open_file_location(path: &str) -> Result<(), String> {
    validate_local_path(path, "文件路径")?;
    let explorer = wide("explorer.exe");
    let parameters = wide(&format!("/select,\"{}\"", path));
    let operation = wide("open");
    unsafe {
        let result = ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            explorer.as_ptr(),
            parameters.as_ptr(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        );
        if (result as usize) <= 32 {
            return Err(format!("无法打开文件位置（错误码 {}）", result as usize));
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn launch_as_admin(path: &str) -> Result<(), String> {
    validate_local_path(path, "程序路径")?;
    open_with_shell(path, Some("runas"))
}

#[cfg(target_os = "windows")]
struct WindowSearch {
    title: String,
    process_id: Option<u32>,
    found: Option<HWND>,
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn find_window_callback(hwnd: HWND, data: LPARAM) -> BOOL {
    let search = &mut *(data as *mut WindowSearch);
    if IsWindowVisible(hwnd) == 0 {
        return 1;
    }

    if let Some(process_id) = search.process_id {
        let mut window_process_id = 0;
        GetWindowThreadProcessId(hwnd, &mut window_process_id);
        if process_id != window_process_id {
            return 1;
        }
    }

    if !search.title.is_empty() {
        let mut buffer = [0u16; 512];
        let length = GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32);
        if length <= 0 {
            return 1;
        }
        let title = String::from_utf16_lossy(&buffer[..length as usize]);
        if !title.to_ascii_lowercase().contains(&search.title) {
            return 1;
        }
    }
    search.found = Some(hwnd);
    0
}

#[cfg(target_os = "windows")]
fn find_window(title: &str, process_id: Option<u32>) -> Option<HWND> {
    let mut search = WindowSearch {
        title: title.to_ascii_lowercase(),
        process_id,
        found: None,
    };
    unsafe {
        EnumWindows(Some(find_window_callback), &mut search as *mut _ as LPARAM);
    }
    search.found
}

#[cfg(target_os = "windows")]
pub fn wait_for_window(title: &str, timeout_secs: u32) -> Result<bool, String> {
    validate_text(title, "窗口标题", 512)?;
    let deadline =
        std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs.min(300) as u64);
    while std::time::Instant::now() < deadline {
        if find_window(title, None).is_some() {
            return Ok(true);
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
    Ok(find_window(title, None).is_some())
}

#[cfg(target_os = "windows")]
pub fn activate_process_window(process_name: &str) -> Result<bool, String> {
    let pid = process_ids(process_name)?.into_iter().next();
    let Some(pid) = pid else { return Ok(false) };
    let Some(hwnd) = find_window("", Some(pid)) else {
        return Ok(false);
    };
    unsafe {
        SetForegroundWindow(hwnd);
    }
    Ok(true)
}

#[cfg(target_os = "windows")]
fn key_input(vk: u16, scan: u16, flags: DWORD) -> INPUT {
    unsafe {
        let mut input: INPUT = zeroed();
        input.type_ = INPUT_KEYBOARD;
        *input.u.ki_mut() = KEYBDINPUT {
            wVk: vk,
            wScan: scan,
            dwFlags: flags,
            time: 0,
            dwExtraInfo: 0,
        };
        input
    }
}

#[cfg(target_os = "windows")]
fn send_key(vk: u16, scan: u16, flags: DWORD) -> Result<(), String> {
    let mut inputs = [
        key_input(vk, scan, flags),
        key_input(vk, scan, flags | KEYEVENTF_KEYUP),
    ];
    unsafe {
        if SendInput(
            inputs.len() as UINT,
            inputs.as_mut_ptr(),
            size_of::<INPUT>() as i32,
        ) != inputs.len() as UINT
        {
            return Err("发送按键失败".to_string());
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn send_modifier(vk: u16, down: bool) -> Result<(), String> {
    let flags = if down { 0 } else { KEYEVENTF_KEYUP };
    let mut input = key_input(vk, 0, flags);
    unsafe {
        if SendInput(1, &mut input, size_of::<INPUT>() as i32) != 1 {
            return Err("发送修饰键失败".to_string());
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn named_key(name: &str) -> Option<u16> {
    match name.to_ascii_uppercase().as_str() {
        "ENTER" => Some(0x0D),
        "ESC" | "ESCAPE" => Some(0x1B),
        "TAB" => Some(0x09),
        "SPACE" => Some(0x20),
        "BACKSPACE" => Some(0x08),
        "F1" => Some(0x70),
        "F2" => Some(0x71),
        "F3" => Some(0x72),
        "F4" => Some(0x73),
        "F5" => Some(0x74),
        "F6" => Some(0x75),
        "F7" => Some(0x76),
        "F8" => Some(0x77),
        "F9" => Some(0x78),
        "F10" => Some(0x79),
        "F11" => Some(0x7A),
        "F12" => Some(0x7B),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn ascii_virtual_key(name: &str) -> Option<u16> {
    let mut chars = name.chars();
    let character = chars.next()?;
    if chars.next().is_some() {
        return None;
    }
    match character {
        'a'..='z' | 'A'..='Z' | '0'..='9' => Some(character.to_ascii_uppercase() as u16),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
pub fn send_keys(keys: &str) -> Result<(), String> {
    validate_text(keys, "按键", 128)?;
    let mut remaining = keys;
    while !remaining.is_empty() {
        let (token, rest) = if let Some(stripped) = remaining.strip_prefix('{') {
            let end = stripped.find('}').ok_or("按键格式无效")?;
            (&stripped[..end], &stripped[end + 1..])
        } else {
            let ch = remaining.chars().next().ok_or("按键格式无效")?;
            let len = ch.len_utf8();
            (&remaining[..len], &remaining[len..])
        };
        remaining = rest;

        let mut modifiers = Vec::new();
        let mut key_sent = false;
        let mut token_chars = token.chars();
        while let Some(prefix) = token_chars.next() {
            let modifier = match prefix {
                '^' => Some(VK_CONTROL as u16),
                '+' => Some(VK_SHIFT as u16),
                '%' => Some(VK_MENU as u16),
                _ => None,
            };
            if let Some(modifier) = modifier {
                modifiers.push(modifier);
            } else {
                let key = std::iter::once(prefix)
                    .chain(token_chars)
                    .collect::<String>();
                for &modifier in &modifiers {
                    send_modifier(modifier, true)?;
                }
                if let Some(vk) = named_key(&key).or_else(|| {
                    (!modifiers.is_empty())
                        .then(|| ascii_virtual_key(&key))
                        .flatten()
                }) {
                    send_key(vk, 0, 0)?;
                } else {
                    for ch in key.chars() {
                        send_key(0, ch as u16, KEYEVENTF_UNICODE)?;
                    }
                }
                key_sent = true;
                for &modifier in modifiers.iter().rev() {
                    send_modifier(modifier, false)?;
                }
                modifiers.clear();
                break;
            }
        }
        if token.is_empty() || !key_sent {
            return Err("按键格式无效".to_string());
        }
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn is_process_running(_name: &str) -> Result<bool, String> {
    Ok(false)
}
#[cfg(not(target_os = "windows"))]
pub fn close_process(_name: &str) -> Result<usize, String> {
    Err("进程操作仅支持 Windows".to_string())
}
#[cfg(not(target_os = "windows"))]
pub fn open_url(_value: &str) -> Result<(), String> {
    Err("打开网址仅支持 Windows".to_string())
}
#[cfg(not(target_os = "windows"))]
pub fn open_folder(_value: &str) -> Result<(), String> {
    Err("打开文件夹仅支持 Windows".to_string())
}
#[cfg(not(target_os = "windows"))]
pub fn open_file(_value: &str) -> Result<(), String> {
    Err("打开文件仅支持 Windows".to_string())
}
#[cfg(not(target_os = "windows"))]
pub fn launch_as_admin(_value: &str) -> Result<(), String> {
    Err("管理员启动仅支持 Windows".to_string())
}
#[cfg(not(target_os = "windows"))]
pub fn wait_for_window(_title: &str, _timeout_secs: u32) -> Result<bool, String> {
    Ok(false)
}
#[cfg(not(target_os = "windows"))]
pub fn activate_process_window(_name: &str) -> Result<bool, String> {
    Ok(false)
}
#[cfg(not(target_os = "windows"))]
pub fn send_keys(_keys: &str) -> Result<(), String> {
    Err("发送按键仅支持 Windows".to_string())
}
#[cfg(not(target_os = "windows"))]
pub fn open_file_location(_value: &str) -> Result<(), String> {
    Err("打开文件位置仅支持 Windows".to_string())
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::validate_process_name;

    #[test]
    fn 进程名只允许文件名并统一去除扩展名() {
        assert_eq!(
            validate_process_name("Program-Manager.exe").unwrap(),
            "program-manager"
        );
        assert!(validate_process_name(r"C:\\Program Manager\\program-manager.exe").is_err());
        assert!(validate_process_name("program manager").is_err());
    }
}
