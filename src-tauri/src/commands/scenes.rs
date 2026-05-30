use serde::Serialize;
use std::time::Instant;

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
pub fn is_process_running(process_name: String) -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;

        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let output = Command::new("tasklist")
            .args(&["/FI", &format!("IMAGENAME eq {}.exe", process_name), "/NH"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
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

#[tauri::command]
pub fn send_keys(keys: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;

        const CREATE_NO_WINDOW: u32 = 0x08000000;

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

            std::thread::sleep(Duration::from_millis(500));
        }

        Ok(false)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("等待窗口仅支持 Windows".to_string())
    }
}

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

        Ok(ActionResult {
            success: output.status.success(),
            output: String::from_utf8_lossy(&output.stdout).to_string(),
            error_output: String::from_utf8_lossy(&output.stderr).to_string(),
            exit_code: output.status.code().unwrap_or(-1),
            execution_time: start_time.elapsed().as_millis() as u64,
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("动作模板执行仅支持 Windows".to_string())
    }
}
