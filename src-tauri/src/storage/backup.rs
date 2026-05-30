use crate::storage::atomic_write::write_atomic;
use crate::storage::error::StorageError;
use crate::storage::json_store::now_millis;
use crate::storage::paths;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub created_at: u64,
    pub reason: String,
    pub files: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct BackupResult {
    pub dir: PathBuf,
    pub files: Vec<String>,
}

const FULL_BACKUP_FILES: &[&str] = &[
    paths::CONFIG_FILE,
    paths::SCENES_FILE,
    paths::NOTES_FILE,
    paths::TODOS_FILE,
    paths::CLIPBOARD_FILE,
    paths::ACTIONS_FILE,
    paths::MIGRATIONS_FILE,
];

pub fn create_migration_backup(
    reason: &str,
    legacy_payload: Option<&Value>,
) -> Result<BackupResult, StorageError> {
    let dir = paths::backups_dir().join(format!("migration-{}", now_millis()));
    fs::create_dir_all(&dir)?;

    let mut files = Vec::new();
    let config_path = paths::config_path();
    if config_path.exists() {
        fs::copy(&config_path, dir.join(paths::CONFIG_FILE))?;
        files.push(paths::CONFIG_FILE.to_string());
    }

    if let Some(payload) = legacy_payload {
        let content = serde_json::to_vec_pretty(payload)?;
        write_atomic(&dir.join("legacy-local-storage.json"), &content)?;
        files.push("legacy-local-storage.json".to_string());
    }

    let manifest = BackupManifest {
        created_at: now_millis(),
        reason: reason.to_string(),
        files: files.clone(),
    };
    let manifest_content = serde_json::to_vec_pretty(&manifest)?;
    write_atomic(&dir.join("manifest.json"), &manifest_content)?;
    files.push("manifest.json".to_string());

    Ok(BackupResult { dir, files })
}

pub fn create_full_backup(reason: &str) -> Result<BackupResult, StorageError> {
    let dir = paths::backups_dir().join(format!("full-{}", now_millis()));
    fs::create_dir_all(&dir)?;

    let mut files = Vec::new();
    for file_name in FULL_BACKUP_FILES {
        let source = paths::data_file(file_name);
        if source.exists() {
            fs::copy(&source, dir.join(file_name))?;
            files.push((*file_name).to_string());
        }
    }

    let icons_source = paths::icons_dir();
    if icons_source.exists() {
        let icons_target = dir.join("icons");
        copy_dir_recursive(&icons_source, &icons_target)?;
        files.push("icons/".to_string());
    }

    write_manifest(&dir, reason, &mut files)?;
    Ok(BackupResult { dir, files })
}

pub fn restore_full_backup(backup_dir: &Path) -> Result<(), StorageError> {
    for file_name in FULL_BACKUP_FILES {
        let source = backup_dir.join(file_name);
        let target = paths::data_file(file_name);
        if source.exists() {
            fs::copy(source, target)?;
        } else if target.exists() {
            fs::remove_file(target)?;
        }
    }

    let icons_backup = backup_dir.join("icons");
    let icons_target = paths::icons_dir();
    if icons_target.exists() {
        fs::remove_dir_all(&icons_target)?;
    }
    if icons_backup.exists() {
        copy_dir_recursive(&icons_backup, &icons_target)?;
    } else {
        fs::create_dir_all(&icons_target)?;
    }

    Ok(())
}

pub fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), StorageError> {
    fs::create_dir_all(target)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        if source_path.is_dir() {
            copy_dir_recursive(&source_path, &target_path)?;
        } else if source_path.is_file() {
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(source_path, target_path)?;
        }
    }
    Ok(())
}

fn write_manifest(dir: &Path, reason: &str, files: &mut Vec<String>) -> Result<(), StorageError> {
    let manifest = BackupManifest {
        created_at: now_millis(),
        reason: reason.to_string(),
        files: files.clone(),
    };
    let manifest_content = serde_json::to_vec_pretty(&manifest)?;
    write_atomic(&dir.join("manifest.json"), &manifest_content)?;
    files.push("manifest.json".to_string());
    Ok(())
}
