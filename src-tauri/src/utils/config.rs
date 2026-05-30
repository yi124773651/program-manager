use crate::models::Config;
use std::fs;
use std::path::PathBuf;
pub fn get_config_path() -> PathBuf {
    crate::storage::paths::config_path()
}

/// 获取图标存储目录
pub fn get_icons_dir() -> PathBuf {
    crate::storage::paths::icons_dir()
}

/// 获取图标文件的完整路径
pub fn get_icon_path(icon_filename: &str) -> PathBuf {
    get_icons_dir().join(icon_filename)
}

pub fn load_or_create_config() -> Config {
    let config_path = get_config_path();

    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(mut config) = serde_json::from_str::<Config>(&content) {
                // 迁移旧的 base64 图标到文件存储
                migrate_icons(&mut config);
                return config;
            }
        }
    }

    // 返回默认配置
    Config::default()
}

/// 迁移 base64 图标到文件存储
fn migrate_icons(config: &mut Config) {
    use base64::Engine;

    let icons_dir = get_icons_dir();
    let mut needs_save = false;

    for (app_id, app) in config.apps.iter_mut() {
        if let Some(ref icon) = app.icon {
            // 检查是否是 base64 格式（data:image 开头）
            if icon.starts_with("data:image") {
                // 提取 base64 数据
                if let Some(base64_start) = icon.find("base64,") {
                    let base64_data = &icon[base64_start + 7..];

                    // 解码 base64
                    if let Ok(icon_bytes) =
                        base64::engine::general_purpose::STANDARD.decode(base64_data)
                    {
                        // 生成图标文件名
                        let icon_filename = format!("{}.png", app_id);
                        let icon_path = icons_dir.join(&icon_filename);

                        // 写入文件
                        if fs::write(&icon_path, &icon_bytes).is_ok() {
                            // 更新配置中的图标路径为文件名
                            app.icon = Some(icon_filename);
                            needs_save = true;
                            println!("迁移图标: {} -> {}", app.name, icon_path.display());
                        }
                    }
                }
            }
        }
    }

    // 如果有迁移，保存配置
    if needs_save {
        if let Err(e) = save_config(config) {
            eprintln!("保存迁移后的配置失败: {}", e);
        }
    }
}

pub fn save_config(config: &Config) -> Result<(), std::io::Error> {
    let config_path = get_config_path();
    let json = serde_json::to_string_pretty(config)?;
    crate::storage::atomic_write::write_atomic(&config_path, json.as_bytes())
        .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::load_or_create_config;
    use crate::storage::{json_store, paths};
    use base64::Engine;
    use std::fs;
    use std::path::PathBuf;

    fn unique_temp_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "program-manager-{}-{}-{}",
            name,
            std::process::id(),
            json_store::now_millis()
        ))
    }

    #[test]
    fn 旧_base64_图标会迁移为图标文件并回写配置() {
        let data_dir = unique_temp_dir("icon-migration");
        let _guard = paths::set_test_data_dir(data_dir.clone());
        let _ = fs::remove_dir_all(&data_dir);
        fs::create_dir_all(&data_dir).expect("应能创建测试数据目录");

        let icon_bytes = b"icon-bytes";
        let icon_data_url = format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(icon_bytes)
        );
        let config = serde_json::json!({
            "version": "1.1.4",
            "categories": {},
            "apps": {
                "app-1": {
                    "id": "app-1",
                    "name": "旧图标应用",
                    "path": "D:\\Tools\\app.exe",
                    "category": "cat-1",
                    "itemType": "app",
                    "icon": icon_data_url,
                    "createdAt": 1
                }
            },
            "settings": {
                "cardSize": "medium",
                "theme": "auto",
                "sortBy": "lastLaunched"
            }
        });
        fs::write(
            paths::config_path(),
            serde_json::to_vec_pretty(&config).expect("应能序列化测试配置"),
        )
        .expect("应能写入测试配置");

        let migrated = load_or_create_config();

        let app = migrated.apps.get("app-1").expect("应保留应用");
        assert_eq!(app.icon.as_deref(), Some("app-1.png"));
        assert_eq!(
            fs::read(paths::icons_dir().join("app-1.png")).expect("应能读取迁移图标"),
            icon_bytes
        );
        let saved_config = fs::read_to_string(paths::config_path()).expect("应能读取回写配置");
        assert!(saved_config.contains("app-1.png"));
        assert!(!saved_config.contains("data:image/png;base64"));

        let _ = fs::remove_dir_all(data_dir);
    }
}
