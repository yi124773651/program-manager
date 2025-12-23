use std::fs;
use std::path::Path;
use std::time::SystemTime;

/// 验证应用程序路径并返回验证结果
///
/// 返回: (is_valid, reason, path_type)
/// - is_valid: 路径是否有效
/// - reason: 失败原因（如果有）
/// - path_type: 路径类型（local/network/removable）
pub fn validate_app_path(path: &str) -> (bool, Option<String>, Option<String>) {
    let app_path = Path::new(path);

    // 检测路径类型
    let path_type = detect_path_type(path);

    // 检查文件是否存在
    if !app_path.exists() {
        return (false, Some("文件不存在".to_string()), Some(path_type));
    }

    // 尝试访问文件元数据以确认可访问性
    match fs::metadata(path) {
        Ok(_) => (true, None, Some(path_type)),
        Err(e) => {
            let reason = format!("无法访问: {}", e);
            (false, Some(reason), Some(path_type))
        }
    }
}

/// 检测路径类型
///
/// 返回: "local" | "network" | "removable"
pub fn detect_path_type(path: &str) -> String {
    let path_upper = path.to_uppercase();

    // 网络路径 (UNC 路径格式: \\server\share\...)
    if path_upper.starts_with("\\\\") {
        return "network".to_string();
    }

    // Windows 驱动器路径检测
    // 注意：更精确的可移动设备检测需要调用 Windows API GetDriveType
    // 这里简化处理，D-Z 盘符可能是可移动设备或网络驱动器
    if let Some(drive_letter) = path.chars().next() {
        if matches!(drive_letter.to_uppercase().next().unwrap(), 'D'..='Z') {
            // 如果路径以 \\ 开头，已经被判断为 network
            // 其他情况暂时标记为 local，可以后续优化使用 GetDriveType
            return "local".to_string();
        }
    }

    "local".to_string()
}

/// 获取文件元数据（大小和修改时间）
///
/// 返回: Some((file_size, modified_timestamp)) 或 None
pub fn get_file_metadata(path: &str) -> Option<(u64, u64)> {
    let metadata = fs::metadata(path).ok()?;
    let size = metadata.len();
    let modified = metadata
        .modified()
        .ok()?
        .duration_since(SystemTime::UNIX_EPOCH)
        .ok()?
        .as_secs();
    Some((size, modified))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_network_path() {
        assert_eq!(detect_path_type("\\\\server\\share\\file.exe"), "network");
        assert_eq!(detect_path_type("C:\\Program Files\\app.exe"), "local");
    }

    #[test]
    fn test_validate_nonexistent_path() {
        let (valid, reason, _) = validate_app_path("C:\\NonExistent\\app.exe");
        assert_eq!(valid, false);
        assert!(reason.is_some());
    }
}
