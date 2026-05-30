use serde::Serialize;

#[tauri::command]
pub async fn fetch_image_as_base64(url: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;

        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let script = format!(
            r#"
$ProgressPreference = 'SilentlyContinue'
try {{
    $response = Invoke-WebRequest -Uri '{}' -UseBasicParsing -TimeoutSec 15 -MaximumRedirection 5
    $contentType = $response.Headers['Content-Type']
    if ($contentType -is [array]) {{ $contentType = $contentType[0] }}
    if (-not $contentType) {{ $contentType = 'image/jpeg' }}
    if ($contentType -notlike 'image/*') {{ $contentType = 'image/jpeg' }}
    $base64 = [Convert]::ToBase64String($response.Content)
    Write-Output "data:$contentType;base64,$base64"
}} catch {{
    Write-Error $_.Exception.Message
    exit 1
}}
"#,
            url.replace("'", "''")
        );

        let output = Command::new("powershell")
            .args(&["-NoProfile", "-Command", &script])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("执行失败: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("获取图片失败: {}", stderr.trim()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.starts_with("data:image/") {
            Ok(stdout)
        } else {
            Err("返回数据不是有效的图片".to_string())
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("此功能仅支持 Windows".to_string())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateInfo {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_url: String,
    pub release_notes: String,
    pub download_url: String,
}

#[tauri::command]
pub async fn check_app_version_update() -> Result<AppUpdateInfo, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;

        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let current_version = env!("CARGO_PKG_VERSION").to_string();

        let script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ProgressPreference = 'SilentlyContinue'
try {
    $response = Invoke-RestMethod -Uri 'https://api.github.com/repos/yi124773651/program-manager/releases/latest' -TimeoutSec 10
    $json = @{
        tag_name = $response.tag_name
        html_url = $response.html_url
        body = if ($response.body) { $response.body } else { "" }
        download_url = ""
    }
    foreach ($asset in $response.assets) {
        if ($asset.name -like '*setup*' -or $asset.name -like '*.exe') {
            $json.download_url = $asset.browser_download_url
            break
        }
    }
    $json | ConvertTo-Json -Compress
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
"#;

        let output = Command::new("powershell")
            .args(&["-NoProfile", "-Command", script])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("检查更新失败: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("检查更新失败: {}", stderr.trim()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let json: serde_json::Value =
            serde_json::from_str(&stdout).map_err(|e| format!("解析更新信息失败: {}", e))?;

        let tag = json["tag_name"].as_str().unwrap_or("").to_string();
        let latest_version = tag.trim_start_matches('v').to_string();
        let release_url = json["html_url"].as_str().unwrap_or("").to_string();
        let release_notes = json["body"].as_str().unwrap_or("").to_string();
        let download_url = json["download_url"].as_str().unwrap_or("").to_string();
        let has_update = version_is_newer(&current_version, &latest_version);

        Ok(AppUpdateInfo {
            has_update,
            current_version,
            latest_version,
            release_url,
            release_notes,
            download_url,
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("此功能仅支持 Windows".to_string())
    }
}

fn version_is_newer(current: &str, latest: &str) -> bool {
    let parse = |s: &str| -> Vec<u64> { s.split('.').filter_map(|p| p.parse().ok()).collect() };
    let c = parse(current);
    let l = parse(latest);
    for i in 0..c.len().max(l.len()) {
        let cv = c.get(i).copied().unwrap_or(0);
        let lv = l.get(i).copied().unwrap_or(0);
        if lv > cv {
            return true;
        }
        if lv < cv {
            return false;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    #[test]
    fn 语义版本比较能识别新版本() {
        assert!(super::version_is_newer("1.1.4", "1.2.0"));
        assert!(!super::version_is_newer("1.2.0", "1.1.9"));
        assert!(!super::version_is_newer("1.2.0", "1.2.0"));
    }
}
