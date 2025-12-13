use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct App {
    pub id: String,
    pub name: String,
    pub path: String,
    pub category: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "lastLaunched")]
    pub last_launched: Option<u64>,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
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
pub struct AppSettings {
    #[serde(rename = "cardSize")]
    pub card_size: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "lastCategory")]
    pub last_category: Option<String>,
    pub theme: String,
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
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            card_size: "medium".to_string(),
            last_category: None,
            theme: "auto".to_string(),
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
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub version: String,
    pub categories: HashMap<String, Category>,
    pub apps: HashMap<String, App>,
    pub settings: AppSettings,
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
