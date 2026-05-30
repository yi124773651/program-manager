use crate::storage::error::StorageError;
use crate::storage::json_store::{now_millis, read_json, write_json};
use crate::storage::paths;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MigrationLog {
    pub records: Vec<MigrationRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationRecord {
    pub id: String,
    pub finished_at: u64,
    pub success: bool,
    pub errors: Vec<String>,
}

pub fn load_migration_log() -> MigrationLog {
    let path = paths::migrations_path();
    if !path.exists() {
        return MigrationLog::default();
    }
    read_json(&path).unwrap_or_default()
}

pub fn has_completed(id: &str) -> bool {
    load_migration_log()
        .records
        .iter()
        .any(|record| record.id == id && record.success)
}

pub fn append_record(
    id: &str,
    success: bool,
    errors: Vec<String>,
) -> Result<MigrationLog, StorageError> {
    let mut log = load_migration_log();
    log.records.push(MigrationRecord {
        id: id.to_string(),
        finished_at: now_millis(),
        success,
        errors,
    });
    write_json(&paths::migrations_path(), &log)?;
    Ok(log)
}
