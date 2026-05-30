use crate::models::{AppState, Category, Config};
use crate::storage::{backup, json_store, migration, paths};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

const LOCAL_STORAGE_MIGRATION_ID: &str = "local-storage-to-json-v1";

#[tauri::command]
pub fn load_config(state: State<AppState>) -> Result<Config, String> {
    let config = state.config.lock().unwrap();
    Ok(config.clone())
}

#[tauri::command]
pub fn save_config(config: Config, state: State<AppState>, app: AppHandle) -> Result<(), String> {
    let previous_config = {
        let current_config = state.config.lock().unwrap();
        current_config.clone()
    };

    crate::utils::shortcuts::reload_shortcuts_or_restore(&app, &config, &previous_config)?;

    {
        let mut current_config = state.config.lock().unwrap();
        *current_config = config.clone();
    }

    crate::utils::config::save_config(&config).map_err(|e| e.to_string())?;
    app.emit("config-changed", &config)
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_category(name: String, state: State<AppState>) -> Result<Category, String> {
    let mut config = state.config.lock().unwrap();

    let category = Category {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        icon: None,
        apps: Vec::new(),
        order: config.categories.len(),
    };

    config
        .categories
        .insert(category.id.clone(), category.clone());
    crate::utils::config::save_config(&config).map_err(|e| e.to_string())?;
    Ok(category)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyDataStatus {
    pub migration_id: String,
    pub already_completed: bool,
    pub has_scenes: bool,
    pub has_notes: bool,
    pub has_todos: bool,
    pub has_clipboard: bool,
    pub has_actions: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LegacyLocalStoragePayload {
    pub scenes: Option<Value>,
    pub notes: Option<Value>,
    pub todos: Option<Value>,
    pub clipboard: Option<Value>,
    pub actions: Option<Value>,
    #[serde(default)]
    #[serde(rename = "legacyRaw")]
    pub legacy_raw: Option<HashMap<String, String>>,
    #[serde(default)]
    #[serde(rename = "frontendErrors")]
    pub frontend_errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyMigrationResult {
    pub migration_id: String,
    pub success: bool,
    pub skipped: bool,
    pub backup_dir: Option<String>,
    pub written_files: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PersistedDataType {
    Scenes,
    Notes,
    Todos,
    Clipboard,
    Actions,
}

impl PersistedDataType {
    fn path(self) -> PathBuf {
        match self {
            PersistedDataType::Scenes => paths::scenes_path(),
            PersistedDataType::Notes => paths::notes_path(),
            PersistedDataType::Todos => paths::todos_path(),
            PersistedDataType::Clipboard => paths::clipboard_path(),
            PersistedDataType::Actions => paths::actions_path(),
        }
    }
}

#[tauri::command]
pub fn read_persisted_data(
    data_type: PersistedDataType,
) -> Result<Option<json_store::DataEnvelope<Value>>, String> {
    let path = data_type.path();
    if !path.exists() {
        return Ok(None);
    }

    json_store::read_enveloped_json(&path)
        .map(Some)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn write_persisted_data(
    data_type: PersistedDataType,
    data: Value,
) -> Result<json_store::DataEnvelope<Value>, String> {
    let envelope = json_store::DataEnvelope {
        schema_version: 1,
        updated_at: json_store::now_millis(),
        data,
    };
    json_store::write_json(&data_type.path(), &envelope).map_err(|error| error.to_string())?;
    Ok(envelope)
}

#[tauri::command]
pub fn get_legacy_data_status(payload: Option<LegacyLocalStoragePayload>) -> LegacyDataStatus {
    let payload = payload.unwrap_or_default();
    LegacyDataStatus {
        migration_id: LOCAL_STORAGE_MIGRATION_ID.to_string(),
        already_completed: migration::has_completed(LOCAL_STORAGE_MIGRATION_ID),
        has_scenes: payload.scenes.is_some(),
        has_notes: payload.notes.is_some(),
        has_todos: payload.todos.is_some(),
        has_clipboard: payload.clipboard.is_some(),
        has_actions: payload.actions.is_some(),
    }
}

#[tauri::command]
pub fn get_migration_status() -> migration::MigrationLog {
    migration::load_migration_log()
}

#[tauri::command]
pub fn migrate_legacy_local_storage(
    payload: LegacyLocalStoragePayload,
) -> Result<LegacyMigrationResult, String> {
    if migration::has_completed(LOCAL_STORAGE_MIGRATION_ID) {
        return Ok(LegacyMigrationResult {
            migration_id: LOCAL_STORAGE_MIGRATION_ID.to_string(),
            success: true,
            skipped: true,
            backup_dir: None,
            written_files: Vec::new(),
            errors: Vec::new(),
        });
    }

    let legacy_snapshot = serde_json::to_value(&payload).map_err(|error| error.to_string())?;
    let backup = backup::create_migration_backup(
        "迁移旧 localStorage 数据到本地 JSON 文件",
        Some(&legacy_snapshot),
    )
    .map_err(|error| error.to_string())?;

    let mut written_files = Vec::new();
    let mut errors = payload.frontend_errors.clone();

    write_legacy_value(
        paths::scenes_path(),
        paths::SCENES_FILE,
        payload.scenes,
        &mut written_files,
        &mut errors,
    );
    write_legacy_value(
        paths::notes_path(),
        paths::NOTES_FILE,
        payload.notes,
        &mut written_files,
        &mut errors,
    );
    write_legacy_value(
        paths::todos_path(),
        paths::TODOS_FILE,
        payload.todos,
        &mut written_files,
        &mut errors,
    );
    write_legacy_value(
        paths::clipboard_path(),
        paths::CLIPBOARD_FILE,
        payload.clipboard,
        &mut written_files,
        &mut errors,
    );
    write_legacy_value(
        paths::actions_path(),
        paths::ACTIONS_FILE,
        payload.actions,
        &mut written_files,
        &mut errors,
    );

    let success = errors.is_empty();
    migration::append_record(LOCAL_STORAGE_MIGRATION_ID, success, errors.clone())
        .map_err(|error| error.to_string())?;

    Ok(LegacyMigrationResult {
        migration_id: LOCAL_STORAGE_MIGRATION_ID.to_string(),
        success,
        skipped: false,
        backup_dir: Some(backup.dir.to_string_lossy().to_string()),
        written_files,
        errors,
    })
}

fn write_legacy_value(
    path: std::path::PathBuf,
    file_name: &str,
    value: Option<Value>,
    written_files: &mut Vec<String>,
    errors: &mut Vec<String>,
) {
    if let Some(value) = value {
        if let Err(error) = json_store::write_enveloped_json(&path, 1, value) {
            errors.push(format!("写入 {} 失败: {}", file_name, error));
            return;
        }
        written_files.push(file_name.to_string());
    }
}

pub fn current_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::{get_legacy_data_status, migrate_legacy_local_storage, LegacyLocalStoragePayload};
    use crate::storage::{json_store, migration, paths};
    use serde_json::{json, Value};
    use std::collections::HashMap;
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
    fn 旧本地存储迁移会写入统一文件并记录备份和幂等状态() {
        let data_dir = unique_temp_dir("legacy-migration");
        let _guard = paths::set_test_data_dir(data_dir.clone());
        let _ = fs::remove_dir_all(&data_dir);

        let mut legacy_raw = HashMap::new();
        legacy_raw.insert(
            "app_scenes_config".to_string(),
            r#"{"scenes":[{"id":"scene-1"}]}"#.to_string(),
        );
        let payload = LegacyLocalStoragePayload {
            scenes: Some(json!({ "scenes": [{ "id": "scene-1" }] })),
            notes: Some(json!({ "notes": [{ "id": "note-1" }] })),
            todos: Some(json!({ "items": [{ "id": "todo-1" }] })),
            clipboard: Some(json!({ "items": [{ "id": "clip-1" }] })),
            actions: Some(json!({ "enabled": ["open_folder"] })),
            legacy_raw: Some(legacy_raw),
            frontend_errors: Vec::new(),
        };

        let result = migrate_legacy_local_storage(payload).expect("迁移应成功");

        assert!(result.success);
        assert!(!result.skipped);
        assert_eq!(
            result.written_files,
            vec![
                paths::SCENES_FILE,
                paths::NOTES_FILE,
                paths::TODOS_FILE,
                paths::CLIPBOARD_FILE,
                paths::ACTIONS_FILE,
            ]
        );
        let backup_dir = PathBuf::from(result.backup_dir.expect("应返回备份目录"));
        assert!(backup_dir.join("legacy-local-storage.json").is_file());
        assert!(backup_dir.join("manifest.json").is_file());

        let scenes: json_store::DataEnvelope<Value> =
            json_store::read_enveloped_json(&paths::scenes_path()).expect("应能读取场景迁移文件");
        assert_eq!(scenes.schema_version, 1);
        assert_eq!(scenes.data["scenes"][0]["id"], "scene-1");
        assert!(migration::has_completed("local-storage-to-json-v1"));
        assert!(get_legacy_data_status(None).already_completed);

        let skipped = migrate_legacy_local_storage(LegacyLocalStoragePayload::default())
            .expect("重复迁移应成功跳过");
        assert!(skipped.success);
        assert!(skipped.skipped);
        assert!(skipped.written_files.is_empty());

        let _ = fs::remove_dir_all(data_dir);
    }
}
