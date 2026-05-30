use crate::models::AppState;
use crate::storage::atomic_write::write_atomic;
use crate::storage::{backup, json_store, paths};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, State};

const EXPORT_FORMAT_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LocalDataSection {
    Config,
    Scenes,
    Notes,
    Todos,
    Clipboard,
    Actions,
    Icons,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDataFileEntry {
    pub section: LocalDataSection,
    pub path: String,
    pub exists: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDataManifest {
    pub format_version: u32,
    pub app_version: String,
    pub exported_at: u64,
    pub files: Vec<LocalDataFileEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDataExportResult {
    pub export_dir: String,
    pub manifest_path: String,
    pub files: Vec<LocalDataFileEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDataImportSectionPreview {
    pub section: LocalDataSection,
    pub label: String,
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDataImportPreview {
    pub manifest_path: String,
    pub package_dir: String,
    pub app_version: String,
    pub exported_at: u64,
    pub sections: Vec<LocalDataImportSectionPreview>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDataImportOptions {
    pub sections: Vec<LocalDataSection>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDataImportResult {
    pub success: bool,
    pub backup_dir: String,
    pub imported_sections: Vec<LocalDataSection>,
    pub errors: Vec<String>,
}

struct SectionFile {
    section: LocalDataSection,
    label: &'static str,
    relative_path: &'static str,
    source_path: PathBuf,
    target_path: PathBuf,
}

fn section_files() -> Vec<SectionFile> {
    vec![
        SectionFile {
            section: LocalDataSection::Config,
            label: "主配置",
            relative_path: paths::CONFIG_FILE,
            source_path: paths::config_path(),
            target_path: paths::config_path(),
        },
        SectionFile {
            section: LocalDataSection::Scenes,
            label: "场景",
            relative_path: paths::SCENES_FILE,
            source_path: paths::scenes_path(),
            target_path: paths::scenes_path(),
        },
        SectionFile {
            section: LocalDataSection::Notes,
            label: "便签",
            relative_path: paths::NOTES_FILE,
            source_path: paths::notes_path(),
            target_path: paths::notes_path(),
        },
        SectionFile {
            section: LocalDataSection::Todos,
            label: "待办",
            relative_path: paths::TODOS_FILE,
            source_path: paths::todos_path(),
            target_path: paths::todos_path(),
        },
        SectionFile {
            section: LocalDataSection::Clipboard,
            label: "剪贴板",
            relative_path: paths::CLIPBOARD_FILE,
            source_path: paths::clipboard_path(),
            target_path: paths::clipboard_path(),
        },
        SectionFile {
            section: LocalDataSection::Actions,
            label: "快捷动作",
            relative_path: paths::ACTIONS_FILE,
            source_path: paths::actions_path(),
            target_path: paths::actions_path(),
        },
        SectionFile {
            section: LocalDataSection::Icons,
            label: "图标",
            relative_path: "icons",
            source_path: paths::icons_dir(),
            target_path: paths::icons_dir(),
        },
    ]
}

#[tauri::command]
pub fn export_local_data(export_dir: String) -> Result<LocalDataExportResult, String> {
    let export_dir = PathBuf::from(export_dir).join(format!(
        "program-manager-export-{}",
        json_store::now_millis()
    ));
    fs::create_dir_all(&export_dir).map_err(|error| error.to_string())?;

    let mut files = Vec::new();
    for item in section_files() {
        if item.section == LocalDataSection::Icons {
            let target = export_dir.join(item.relative_path);
            let exists = item.source_path.exists();
            if exists {
                if target.exists() {
                    fs::remove_dir_all(&target).map_err(|error| error.to_string())?;
                }
                backup::copy_dir_recursive(&item.source_path, &target)
                    .map_err(|error| error.to_string())?;
            }
            files.push(LocalDataFileEntry {
                section: item.section,
                path: item.relative_path.to_string(),
                exists,
                size: None,
            });
            continue;
        }

        let exists = item.source_path.exists();
        let mut size = None;
        if exists {
            let target = export_dir.join(item.relative_path);
            fs::copy(&item.source_path, &target).map_err(|error| error.to_string())?;
            size = fs::metadata(&item.source_path)
                .ok()
                .map(|metadata| metadata.len());
        }

        files.push(LocalDataFileEntry {
            section: item.section,
            path: item.relative_path.to_string(),
            exists,
            size,
        });
    }

    let manifest = LocalDataManifest {
        format_version: EXPORT_FORMAT_VERSION,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        exported_at: json_store::now_millis(),
        files: files.clone(),
    };
    let manifest_path = export_dir.join("manifest.json");
    let manifest_content =
        serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?;
    write_atomic(&manifest_path, &manifest_content).map_err(|error| error.to_string())?;

    Ok(LocalDataExportResult {
        export_dir: export_dir.to_string_lossy().to_string(),
        manifest_path: manifest_path.to_string_lossy().to_string(),
        files,
    })
}

#[tauri::command]
pub fn preview_local_data_import(manifest_path: String) -> Result<LocalDataImportPreview, String> {
    let manifest_path = PathBuf::from(manifest_path);
    let package_dir = manifest_path
        .parent()
        .ok_or_else(|| "manifest.json 路径无效".to_string())?
        .to_path_buf();
    let manifest = read_manifest(&manifest_path)?;
    Ok(build_preview(&manifest_path, &package_dir, manifest))
}

#[tauri::command]
pub fn import_local_data(
    manifest_path: String,
    options: LocalDataImportOptions,
    state: State<AppState>,
    app: AppHandle,
) -> Result<LocalDataImportResult, String> {
    let manifest_path = PathBuf::from(manifest_path);
    let (package_dir, selected) = validate_import_request(&manifest_path, options.sections)?;
    let previous_config = {
        let config = state.config.lock().unwrap();
        config.clone()
    };

    let backup = match apply_import_with_backup(&package_dir, &selected) {
        Ok(backup) => backup,
        Err(result) => return Ok(result),
    };

    if selected.contains(&LocalDataSection::Config) {
        let next_config = crate::utils::config::load_or_create_config();
        if let Err(error) = crate::utils::shortcuts::reload_shortcuts_or_restore(
            &app,
            &next_config,
            &previous_config,
        ) {
            let _ = backup::restore_full_backup(&backup.dir);
            let mut config = state.config.lock().unwrap();
            *config = previous_config;
            return Ok(LocalDataImportResult {
                success: false,
                backup_dir: backup.dir.to_string_lossy().to_string(),
                imported_sections: Vec::new(),
                errors: vec![format!("导入配置后注册快捷键失败: {}", error)],
            });
        }

        {
            let mut config = state.config.lock().unwrap();
            *config = next_config.clone();
        }
        app.emit("config-changed", &next_config)
            .map_err(|error| error.to_string())?;
    }

    Ok(LocalDataImportResult {
        success: true,
        backup_dir: backup.dir.to_string_lossy().to_string(),
        imported_sections: selected,
        errors: Vec::new(),
    })
}

fn validate_import_request(
    manifest_path: &Path,
    sections: Vec<LocalDataSection>,
) -> Result<(PathBuf, Vec<LocalDataSection>), String> {
    let package_dir = manifest_path
        .parent()
        .ok_or_else(|| "manifest.json 路径无效".to_string())?
        .to_path_buf();
    let manifest = read_manifest(manifest_path)?;
    let preview = build_preview(manifest_path, &package_dir, manifest);
    if !preview.errors.is_empty() {
        return Err(preview.errors.join("；"));
    }

    let selected = normalized_sections(sections);
    if selected.is_empty() {
        return Err("至少选择一类数据导入".to_string());
    }

    Ok((package_dir, selected))
}

fn apply_import_with_backup(
    package_dir: &Path,
    selected: &[LocalDataSection],
) -> Result<backup::BackupResult, LocalDataImportResult> {
    let backup = match backup::create_full_backup("导入本地数据包前自动备份") {
        Ok(backup) => backup,
        Err(error) => {
            return Err(LocalDataImportResult {
                success: false,
                backup_dir: String::new(),
                imported_sections: Vec::new(),
                errors: vec![error.to_string()],
            });
        }
    };
    if !backup.files.iter().any(|file| file == "manifest.json") {
        return Err(LocalDataImportResult {
            success: false,
            backup_dir: backup.dir.to_string_lossy().to_string(),
            imported_sections: Vec::new(),
            errors: vec!["自动备份清单缺失，已取消导入".to_string()],
        });
    }

    if let Err(error) = apply_import(package_dir, selected) {
        let _ = backup::restore_full_backup(&backup.dir);
        return Err(LocalDataImportResult {
            success: false,
            backup_dir: backup.dir.to_string_lossy().to_string(),
            imported_sections: Vec::new(),
            errors: vec![error],
        });
    }

    Ok(backup)
}

fn read_manifest(path: &Path) -> Result<LocalDataManifest, String> {
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let manifest: LocalDataManifest = serde_json::from_str(&content)
        .map_err(|error| format!("manifest.json 无法解析: {}", error))?;
    if manifest.format_version != EXPORT_FORMAT_VERSION {
        return Err(format!(
            "不支持的数据包格式版本: {}",
            manifest.format_version
        ));
    }
    Ok(manifest)
}

fn build_preview(
    manifest_path: &Path,
    package_dir: &Path,
    manifest: LocalDataManifest,
) -> LocalDataImportPreview {
    let mut errors = Vec::new();
    let mut sections = Vec::new();

    for item in section_files() {
        let file_entry = manifest
            .files
            .iter()
            .find(|entry| entry.section == item.section);
        let available = file_entry.map(|entry| entry.exists).unwrap_or(false);
        let package_path = package_dir.join(item.relative_path);

        let mut item_error = None;
        let mut item_count = None;
        if available {
            if item.section == LocalDataSection::Icons {
                if !package_path.is_dir() {
                    item_error = Some("图标目录不存在".to_string());
                }
            } else if !package_path.is_file() {
                item_error = Some("数据文件不存在".to_string());
            } else {
                match read_json_value(&package_path) {
                    Ok(value) => {
                        item_count = count_items(item.section, &value);
                    }
                    Err(error) => {
                        item_error = Some(error);
                    }
                }
            }
        }

        if let Some(error) = &item_error {
            errors.push(format!("{} 校验失败: {}", item.label, error));
        }

        sections.push(LocalDataImportSectionPreview {
            section: item.section,
            label: item.label.to_string(),
            available,
            item_count,
            error: item_error,
        });
    }

    LocalDataImportPreview {
        manifest_path: manifest_path.to_string_lossy().to_string(),
        package_dir: package_dir.to_string_lossy().to_string(),
        app_version: manifest.app_version,
        exported_at: manifest.exported_at,
        sections,
        errors,
    }
}

fn apply_import(package_dir: &Path, selected: &[LocalDataSection]) -> Result<(), String> {
    for item in section_files() {
        if !selected.contains(&item.section) {
            continue;
        }

        let source = package_dir.join(item.relative_path);
        if item.section == LocalDataSection::Icons {
            if item.target_path.exists() {
                fs::remove_dir_all(&item.target_path).map_err(|error| error.to_string())?;
            }
            backup::copy_dir_recursive(&source, &item.target_path)
                .map_err(|error| error.to_string())?;
        } else {
            let bytes = fs::read(&source).map_err(|error| error.to_string())?;
            write_atomic(&item.target_path, &bytes).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn normalized_sections(sections: Vec<LocalDataSection>) -> Vec<LocalDataSection> {
    let mut selected = Vec::new();
    for section in sections {
        if !selected.contains(&section) {
            selected.push(section);
        }
    }
    selected
}

fn read_json_value(path: &Path) -> Result<Value, String> {
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&content).map_err(|error| error.to_string())
}

fn count_items(section: LocalDataSection, value: &Value) -> Option<usize> {
    match section {
        LocalDataSection::Config => value
            .get("apps")
            .and_then(Value::as_object)
            .map(|apps| apps.len()),
        LocalDataSection::Scenes => value
            .pointer("/data/scenes")
            .and_then(Value::as_array)
            .map(|items| items.len()),
        LocalDataSection::Notes => value
            .pointer("/data/notes")
            .and_then(Value::as_array)
            .map(|items| items.len()),
        LocalDataSection::Todos => value
            .pointer("/data/items")
            .and_then(Value::as_array)
            .map(|items| items.len()),
        LocalDataSection::Clipboard => value
            .pointer("/data/items")
            .and_then(Value::as_array)
            .map(|items| items.len()),
        LocalDataSection::Actions => value
            .pointer("/data/enabled")
            .and_then(Value::as_array)
            .map(|items| items.len()),
        LocalDataSection::Icons => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        apply_import_with_backup, build_preview, count_items, export_local_data,
        validate_import_request, LocalDataFileEntry, LocalDataManifest, LocalDataSection,
    };
    use crate::storage::{json_store, paths};
    use serde_json::json;
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

    fn write_sample_local_data() {
        fs::write(
            paths::config_path(),
            r#"{"version":"1.1.4","categories":{},"apps":{"app-1":{"id":"app-1","name":"编辑器","path":"D:\\Tools\\editor.exe","category":"cat-1","itemType":"app","createdAt":1}},"settings":{"cardSize":"medium","theme":"auto","sortBy":"lastLaunched"}}"#,
        )
        .expect("应能写入配置");
        json_store::write_enveloped_json(
            &paths::scenes_path(),
            1,
            json!({ "scenes": [{ "id": "scene-1", "name": "工作", "icon": "⚡", "actions": [], "createdAt": 1, "updatedAt": 1 }] }),
        )
        .expect("应能写入场景");
        json_store::write_enveloped_json(
            &paths::notes_path(),
            1,
            json!({ "notes": [{ "id": "note-1", "content": "便签", "createdAt": 1, "updatedAt": 1 }] }),
        )
        .expect("应能写入便签");
        json_store::write_enveloped_json(
            &paths::todos_path(),
            1,
            json!({ "items": [{ "id": "todo-1", "title": "待办", "date": "2026-05-30", "completed": false, "createdAt": 1, "updatedAt": 1 }] }),
        )
        .expect("应能写入待办");
        json_store::write_enveloped_json(
            &paths::clipboard_path(),
            1,
            json!({ "items": [{ "id": "clip-1", "content": "剪贴板", "contentType": "text", "createdAt": 1, "pinned": false }] }),
        )
        .expect("应能写入剪贴板");
        json_store::write_enveloped_json(
            &paths::actions_path(),
            1,
            json!({ "enabled": ["open_folder", "copy_path"] }),
        )
        .expect("应能写入动作");
        fs::write(paths::icons_dir().join("app-1.png"), b"icon").expect("应能写入图标");
    }

    #[test]
    fn 可以统计导入预览中的数据数量() {
        assert_eq!(
            count_items(
                LocalDataSection::Scenes,
                &json!({ "data": { "scenes": [{ "id": "1" }] } })
            ),
            Some(1)
        );
        assert_eq!(
            count_items(LocalDataSection::Config, &json!({ "apps": { "a": {} } })),
            Some(1)
        );
    }

    #[test]
    fn 缺失文件会在预览中标记为不可用() {
        let manifest = LocalDataManifest {
            format_version: 1,
            app_version: "1.1.4".to_string(),
            exported_at: 1,
            files: vec![LocalDataFileEntry {
                section: LocalDataSection::Scenes,
                path: "scenes.json".to_string(),
                exists: false,
                size: None,
            }],
        };

        let preview = build_preview(
            &PathBuf::from("manifest.json"),
            &PathBuf::from("."),
            manifest,
        );

        let scenes = preview
            .sections
            .iter()
            .find(|section| section.section == LocalDataSection::Scenes)
            .expect("应存在场景预览");
        assert!(!scenes.available);
    }

    #[test]
    fn 有效数据包预览会统计各类数据数量() {
        let dir = std::env::temp_dir().join(format!(
            "program-manager-local-data-preview-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("icons")).expect("应能创建测试目录");

        fs::write(dir.join("config.json"), r#"{"apps":{"app-1":{}}}"#).expect("应能写入配置");
        fs::write(
            dir.join("scenes.json"),
            r#"{"schemaVersion":1,"updatedAt":1,"data":{"scenes":[{"id":"scene-1"}]}}"#,
        )
        .expect("应能写入场景");
        fs::write(
            dir.join("notes.json"),
            r#"{"schemaVersion":1,"updatedAt":1,"data":{"notes":[{"id":"note-1"},{"id":"note-2"}]}}"#,
        )
        .expect("应能写入便签");
        fs::write(
            dir.join("todos.json"),
            r#"{"schemaVersion":1,"updatedAt":1,"data":{"items":[{"id":"todo-1"}]}}"#,
        )
        .expect("应能写入待办");
        fs::write(
            dir.join("clipboard.json"),
            r#"{"schemaVersion":1,"updatedAt":1,"data":{"items":[{"id":"clip-1"}]}}"#,
        )
        .expect("应能写入剪贴板");
        fs::write(
            dir.join("actions.json"),
            r#"{"schemaVersion":1,"updatedAt":1,"data":{"enabled":["open_folder","copy_path"]}}"#,
        )
        .expect("应能写入动作");

        let manifest = LocalDataManifest {
            format_version: 1,
            app_version: "1.1.4".to_string(),
            exported_at: 1,
            files: vec![
                (LocalDataSection::Config, "config.json"),
                (LocalDataSection::Scenes, "scenes.json"),
                (LocalDataSection::Notes, "notes.json"),
                (LocalDataSection::Todos, "todos.json"),
                (LocalDataSection::Clipboard, "clipboard.json"),
                (LocalDataSection::Actions, "actions.json"),
                (LocalDataSection::Icons, "icons"),
            ]
            .into_iter()
            .map(|(section, path)| LocalDataFileEntry {
                section,
                path: path.to_string(),
                exists: true,
                size: None,
            })
            .collect(),
        };

        let preview = build_preview(&dir.join("manifest.json"), &dir, manifest);

        assert!(preview.errors.is_empty());
        assert_eq!(
            preview
                .sections
                .iter()
                .find(|section| section.section == LocalDataSection::Config)
                .and_then(|section| section.item_count),
            Some(1)
        );
        assert_eq!(
            preview
                .sections
                .iter()
                .find(|section| section.section == LocalDataSection::Notes)
                .and_then(|section| section.item_count),
            Some(2)
        );
        assert!(preview
            .sections
            .iter()
            .find(|section| section.section == LocalDataSection::Icons)
            .map(|section| section.available)
            .unwrap_or(false));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn 导出包包含所有本地数据文件和图标目录() {
        let data_dir = unique_temp_dir("local-data-export-source");
        let export_parent = unique_temp_dir("local-data-export-target");
        let _guard = paths::set_test_data_dir(data_dir.clone());
        let _ = fs::remove_dir_all(&data_dir);
        let _ = fs::remove_dir_all(&export_parent);
        fs::create_dir_all(&export_parent).expect("应能创建导出父目录");
        write_sample_local_data();

        let result =
            export_local_data(export_parent.to_string_lossy().to_string()).expect("导出应成功");
        let export_dir = PathBuf::from(&result.export_dir);

        assert!(PathBuf::from(&result.manifest_path).is_file());
        assert!(export_dir.join(paths::CONFIG_FILE).is_file());
        assert!(export_dir.join(paths::SCENES_FILE).is_file());
        assert!(export_dir.join(paths::NOTES_FILE).is_file());
        assert!(export_dir.join(paths::TODOS_FILE).is_file());
        assert!(export_dir.join(paths::CLIPBOARD_FILE).is_file());
        assert!(export_dir.join(paths::ACTIONS_FILE).is_file());
        assert!(export_dir.join("icons").join("app-1.png").is_file());
        assert_eq!(result.files.len(), 7);

        let _ = fs::remove_dir_all(data_dir);
        let _ = fs::remove_dir_all(export_parent);
    }

    #[test]
    fn 数据包可选择性导入并保留未选择数据() {
        let source_dir = unique_temp_dir("local-data-import-source");
        let target_dir = unique_temp_dir("local-data-import-target");
        let export_parent = unique_temp_dir("local-data-import-package");
        let _ = fs::remove_dir_all(&source_dir);
        let _ = fs::remove_dir_all(&target_dir);
        let _ = fs::remove_dir_all(&export_parent);
        fs::create_dir_all(&export_parent).expect("应能创建导出父目录");

        let package_manifest = {
            let _source_guard = paths::set_test_data_dir(source_dir.clone());
            write_sample_local_data();
            let result =
                export_local_data(export_parent.to_string_lossy().to_string()).expect("导出应成功");
            result.manifest_path
        };

        {
            let _target_guard = paths::set_test_data_dir(target_dir.clone());
            fs::write(
                paths::config_path(),
                r#"{"version":"1.1.4","categories":{},"apps":{"old-app":{"id":"old-app","name":"旧应用","path":"D:\\Old\\old.exe","category":"cat-1","itemType":"app","createdAt":1}},"settings":{"cardSize":"medium","theme":"auto","sortBy":"lastLaunched"}}"#,
            )
            .expect("应能写入旧配置");
            json_store::write_enveloped_json(
                &paths::notes_path(),
                1,
                json!({ "notes": [{ "id": "old-note", "content": "旧便签" }] }),
            )
            .expect("应能写入旧便签");

            let manifest = PathBuf::from(package_manifest);
            let (package_dir, selected) = validate_import_request(
                &manifest,
                vec![
                    LocalDataSection::Config,
                    LocalDataSection::Notes,
                    LocalDataSection::Config,
                ],
            )
            .expect("导入请求应有效");
            assert_eq!(
                selected,
                vec![LocalDataSection::Config, LocalDataSection::Notes]
            );

            let backup = apply_import_with_backup(&package_dir, &selected).expect("导入应成功");
            assert!(backup.dir.is_dir());
            assert!(backup.files.contains(&paths::CONFIG_FILE.to_string()));
            assert!(backup.files.contains(&paths::NOTES_FILE.to_string()));
            assert!(backup.files.contains(&"manifest.json".to_string()));

            let config_text = fs::read_to_string(paths::config_path()).expect("应能读取导入配置");
            let notes_text = fs::read_to_string(paths::notes_path()).expect("应能读取导入便签");
            assert!(config_text.contains("app-1"));
            assert!(notes_text.contains("note-1"));
            assert!(!paths::scenes_path().exists(), "未选择的场景数据不应被写入");
        }

        let _ = fs::remove_dir_all(source_dir);
        let _ = fs::remove_dir_all(target_dir);
        let _ = fs::remove_dir_all(export_parent);
    }

    #[test]
    fn 导入失败会从自动备份恢复原数据() {
        let data_dir = unique_temp_dir("local-data-import-rollback");
        let package_dir = unique_temp_dir("local-data-import-bad-package");
        let _guard = paths::set_test_data_dir(data_dir.clone());
        let _ = fs::remove_dir_all(&data_dir);
        let _ = fs::remove_dir_all(&package_dir);
        fs::create_dir_all(&package_dir).expect("应能创建数据包目录");

        fs::write(paths::config_path(), r#"{"version":"1.1.4","categories":{},"apps":{"old-app":{"id":"old-app","name":"旧应用","path":"D:\\Old\\old.exe","category":"cat-1","itemType":"app","createdAt":1}},"settings":{"cardSize":"medium","theme":"auto","sortBy":"lastLaunched"}}"#)
            .expect("应能写入原配置");
        fs::write(package_dir.join(paths::CONFIG_FILE), r#"{"version":"1.1.4","categories":{},"apps":{"new-app":{"id":"new-app","name":"新应用","path":"D:\\New\\new.exe","category":"cat-1","itemType":"app","createdAt":1}},"settings":{"cardSize":"medium","theme":"auto","sortBy":"lastLaunched"}}"#)
            .expect("应能写入待导入配置");

        let result = apply_import_with_backup(
            &package_dir,
            &[LocalDataSection::Config, LocalDataSection::Icons],
        )
        .expect_err("缺失图标目录应导入失败并触发恢复");

        assert!(!result.success);
        assert!(PathBuf::from(&result.backup_dir).is_dir());
        let config_text = fs::read_to_string(paths::config_path()).expect("应能读取恢复配置");
        assert!(config_text.contains("old-app"));

        let _ = fs::remove_dir_all(data_dir);
        let _ = fs::remove_dir_all(package_dir);
    }
}
