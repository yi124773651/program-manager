use crate::models::Config;
use std::fs;
use std::path::PathBuf;

pub fn get_config_dir() -> PathBuf {
    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("program-manager");

    fs::create_dir_all(&config_dir).ok();
    config_dir
}

pub fn get_config_path() -> PathBuf {
    get_config_dir().join("config.json")
}

/// 获取图标存储目录
pub fn get_icons_dir() -> PathBuf {
    let icons_dir = get_config_dir().join("icons");
    fs::create_dir_all(&icons_dir).ok();
    icons_dir
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
                    if let Ok(icon_bytes) = base64::engine::general_purpose::STANDARD.decode(base64_data) {
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
    fs::write(config_path, json)?;
    Ok(())
}
