use crate::models::Config;
use std::fs;
use std::path::PathBuf;

pub fn get_config_path() -> PathBuf {
    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("program-manager");

    fs::create_dir_all(&config_dir).ok();
    config_dir.join("config.json")
}

pub fn load_or_create_config() -> Config {
    let config_path = get_config_path();

    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(config) = serde_json::from_str(&content) {
                return config;
            }
        }
    }

    // 返回默认配置
    Config::default()
}

pub fn save_config(config: &Config) -> Result<(), std::io::Error> {
    let config_path = get_config_path();
    let json = serde_json::to_string_pretty(config)?;
    fs::write(config_path, json)?;
    Ok(())
}
