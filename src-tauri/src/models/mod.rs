use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

fn default_item_type() -> String {
    "app".to_string()
}

fn default_theme_preset() -> Option<String> {
    Some("fresh-dawn".to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "baselineVersion")]
    pub baseline_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "baselineFileSize")]
    pub baseline_file_size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "baselineModifiedTime")]
    pub baseline_modified_time: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "lastCheckedAt")]
    pub last_checked_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "updateStatus")]
    pub update_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "updateConfidence")]
    pub update_confidence: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct App {
    pub id: String,
    pub name: String,
    pub path: String,
    pub category: String,
    #[serde(default = "default_item_type")]
    #[serde(rename = "itemType")]
    pub item_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "lastLaunched")]
    pub last_launched: Option<u64>,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
    // 更新检测元数据（新增）
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "updateMetadata")]
    pub update_metadata: Option<UpdateMetadata>,
    // 有效性状态（新增）
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "validationStatus")]
    pub validation_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "lastValidatedAt")]
    pub last_validated_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    pub apps: Vec<String>,
    pub order: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettings {
    #[serde(rename = "cardSize")]
    pub card_size: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "lastCategory")]
    pub last_category: Option<String>,
    pub theme: String,
    #[serde(default = "default_theme_preset")]
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "themePreset")]
    pub theme_preset: Option<String>,
    #[serde(rename = "sortBy")]
    pub sort_by: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "themeColor")]
    pub theme_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "backgroundImage")]
    pub background_image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "backgroundOpacity")]
    pub background_opacity: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "windowOpacity")]
    pub window_opacity: Option<f32>,
    // Quicker 效率工具设置
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "quickerEnabled")]
    pub quicker_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "globalShortcutEnabled")]
    pub global_shortcut_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "globalShortcut")]
    pub global_shortcut: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "clipboardHistoryEnabled")]
    pub clipboard_history_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "clipboardMaxItems")]
    pub clipboard_max_items: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "spotlightSearchEnabled")]
    pub spotlight_search_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "spotlightShortcut")]
    pub spotlight_shortcut: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "quickNotesEnabled")]
    pub quick_notes_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "quickNotesShortcut")]
    pub quick_notes_shortcut: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "calculatorEnabled")]
    pub calculator_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "todoScheduleEnabled")]
    pub todo_schedule_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "todoShortcut")]
    pub todo_shortcut: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "backgroundSource")]
    pub background_source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "backgroundApiUrl")]
    pub background_api_url: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            card_size: "medium".to_string(),
            last_category: None,
            theme: "auto".to_string(),
            theme_preset: Some("fresh-dawn".to_string()),
            sort_by: "lastLaunched".to_string(),
            theme_color: Some("#007AFF".to_string()),
            background_image: None,
            background_opacity: Some(0.3),
            window_opacity: Some(0.95),
            // 效率工具默认值
            quicker_enabled: Some(true),
            global_shortcut_enabled: Some(true),
            global_shortcut: Some("Alt+Space".to_string()),
            clipboard_history_enabled: Some(false),
            clipboard_max_items: Some(100),
            spotlight_search_enabled: Some(true),
            spotlight_shortcut: Some("Ctrl+K".to_string()),
            quick_notes_enabled: Some(true),
            quick_notes_shortcut: Some("Alt+N".to_string()),
            calculator_enabled: Some(true),
            todo_schedule_enabled: Some(true),
            todo_shortcut: Some("Alt+T".to_string()),
            background_source: Some("local".to_string()),
            background_api_url: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default = "default_config_version")]
    pub version: String,
    #[serde(default)]
    pub categories: HashMap<String, Category>,
    #[serde(default)]
    pub apps: HashMap<String, App>,
    #[serde(default)]
    pub settings: AppSettings,
}

fn default_config_version() -> String {
    "1.0".to_string()
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: "1.0".to_string(),
            categories: HashMap::new(),
            apps: HashMap::new(),
            settings: AppSettings::default(),
        }
    }
}

pub struct AppState {
    pub config: Mutex<Config>,
}

#[cfg(test)]
mod tests {
    use super::{AppSettings, Config};

    #[test]
    fn 旧设置缺少主题预设时会回退到默认值() {
        let settings: AppSettings =
            serde_json::from_str(r#"{"cardSize":"medium","theme":"auto","sortBy":"lastLaunched"}"#)
                .expect("旧设置应能反序列化");

        assert_eq!(settings.theme_preset.as_deref(), Some("fresh-dawn"));
    }

    #[test]
    fn 默认配置序列化使用前端字段名() {
        let json = serde_json::to_value(Config::default()).expect("默认配置应能序列化");

        assert_eq!(json["settings"]["themePreset"].as_str(), Some("fresh-dawn"));
    }
}
