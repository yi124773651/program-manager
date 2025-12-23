use crate::utils::app_validator::get_file_metadata;
use std::path::Path;

#[cfg(target_os = "windows")]
use winreg::enums::*;
#[cfg(target_os = "windows")]
use winreg::RegKey;

/// 更新检测结果
pub struct UpdateCheckResult {
    pub has_update: bool,
    pub confidence: String,
    pub old_version: Option<String>,
    pub new_version: Option<String>,
    pub file_changed: bool,
    pub size_changed: bool,
    pub modified_time_changed: bool,
}

/// 检测应用程序是否有更新
///
/// 通过对比文件元数据（大小、修改时间）和注册表版本号来判断
pub fn check_for_update(
    app_path: &str,
    baseline_version: Option<String>,
    baseline_size: Option<u64>,
    baseline_modified_time: Option<u64>,
) -> UpdateCheckResult {
    let mut result = UpdateCheckResult {
        has_update: false,
        confidence: "low".to_string(),
        old_version: baseline_version.clone(),
        new_version: None,
        file_changed: false,
        size_changed: false,
        modified_time_changed: false,
    };

    // 1. 检查文件元数据变化
    if let Some((current_size, current_modified)) = get_file_metadata(app_path) {
        // 检查文件大小是否变化
        if let Some(baseline_size) = baseline_size {
            if current_size != baseline_size {
                result.size_changed = true;
                result.file_changed = true;
            }
        }

        // 检查修改时间是否变化（允许 2 秒误差，处理文件系统时间戳精度问题）
        if let Some(baseline_modified) = baseline_modified_time {
            if current_modified.abs_diff(baseline_modified) > 2 {
                result.modified_time_changed = true;
                result.file_changed = true;
            }
        }
    }

    // 2. 检查注册表版本号（Windows only，高可信度）
    #[cfg(target_os = "windows")]
    {
        if let Some(current_version) = get_version_from_registry(app_path) {
            result.new_version = Some(current_version.clone());

            // 如果版本号发生变化，这是最可靠的更新信号
            if let Some(ref baseline_ver) = result.old_version {
                if &current_version != baseline_ver {
                    result.has_update = true;
                    result.confidence = "high".to_string();
                    return result;
                }
            }
        }
    }

    // 3. 基于文件元数据判断（中低可信度）
    if result.file_changed {
        result.has_update = true;
        // 如果大小和时间都变了，可信度较高；否则可信度低
        result.confidence = if result.size_changed && result.modified_time_changed {
            "medium".to_string()
        } else {
            "low".to_string()
        };
    }

    result
}

/// 从 Windows 注册表读取程序版本号
///
/// 搜索常见的注册表位置获取 DisplayVersion
#[cfg(target_os = "windows")]
pub fn get_version_from_registry(exe_path: &str) -> Option<String> {
    // 提取程序名称（不含扩展名）
    let app_name = Path::new(exe_path)
        .file_stem()?
        .to_str()?
        .to_string();

    // 搜索常见的卸载注册表位置
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let paths = vec![
        // 64位程序
        format!(
            "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{}",
            app_name
        ),
        // 32位程序（在64位系统上）
        format!(
            "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{}",
            app_name
        ),
    ];

    for path in paths {
        if let Ok(key) = hklm.open_subkey(&path) {
            if let Ok(version) = key.get_value::<String, _>("DisplayVersion") {
                return Some(version);
            }
        }
    }

    // 尝试搜索所有卸载项（更全面但较慢）
    if let Ok(uninstall_key) = hklm.open_subkey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall") {
        for subkey_name in uninstall_key.enum_keys().filter_map(|k| k.ok()) {
            if let Ok(subkey) = uninstall_key.open_subkey(&subkey_name) {
                // 检查 DisplayName 是否匹配
                if let Ok(display_name) = subkey.get_value::<String, _>("DisplayName") {
                    if display_name.to_lowercase().contains(&app_name.to_lowercase()) {
                        if let Ok(version) = subkey.get_value::<String, _>("DisplayVersion") {
                            return Some(version);
                        }
                    }
                }
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_update_check_no_baseline() {
        let result = check_for_update("C:\\Windows\\notepad.exe", None, None, None);
        // 没有基准数据，应该不判断为有更新
        assert_eq!(result.has_update, false);
    }

    #[test]
    fn test_confidence_levels() {
        // 仅修改时间变化 -> 低可信度
        let result = check_for_update(
            "test.exe",
            None,
            Some(1000),
            Some(1000),
        );

        // 大小和时间都变化 -> 中等可信度
        let result2 = check_for_update(
            "test.exe",
            None,
            Some(1000),
            Some(1000),
        );

        // 实际测试需要真实文件，这里仅作示意
    }
}
