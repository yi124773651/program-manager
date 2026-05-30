use crate::commands::config::current_unix_secs;
use crate::models::{AppState, UpdateMetadata};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub app_id: String,
    pub app_name: String,
    pub is_valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path_type: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckDetails {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_version: Option<String>,
    pub file_changed: bool,
    pub size_changed: bool,
    pub modified_time_changed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub app_id: String,
    pub app_name: String,
    pub has_update: bool,
    pub confidence: String,
    pub details: UpdateCheckDetails,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchOperationResult {
    pub total: usize,
    pub completed: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub errors: Vec<ErrorInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorInfo {
    pub app_id: String,
    pub error: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MaintenanceProgressEvent {
    pub operation: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_name: Option<String>,
    pub total: usize,
    pub completed: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

fn emit_progress(
    app_handle: &AppHandle,
    operation: &str,
    app_id: Option<&str>,
    app_name: Option<&str>,
    total: usize,
    completed: usize,
    succeeded: usize,
    failed: usize,
    status: &str,
    message: Option<String>,
) {
    let _ = app_handle.emit(
        "maintenance-progress",
        MaintenanceProgressEvent {
            operation: operation.to_string(),
            app_id: app_id.map(ToString::to_string),
            app_name: app_name.map(ToString::to_string),
            total,
            completed,
            succeeded,
            failed,
            status: status.to_string(),
            message,
        },
    );
}

#[tauri::command]
pub fn validate_all_apps(
    app_handle: AppHandle,
    state: State<AppState>,
) -> Result<Vec<ValidationResult>, String> {
    let apps_snapshot = {
        let config = state.config.lock().unwrap();
        config
            .apps
            .iter()
            .map(|(app_id, app)| (app_id.clone(), app.name.clone(), app.path.clone()))
            .collect::<Vec<_>>()
    };

    let total = apps_snapshot.len();
    let mut completed = 0;
    let mut succeeded = 0;
    let mut failed = 0;
    let mut results = Vec::with_capacity(total);

    for (app_id, app_name, path) in apps_snapshot {
        let (is_valid, reason, path_type) = crate::utils::app_validator::validate_app_path(&path);
        completed += 1;
        if is_valid {
            succeeded += 1;
        } else {
            failed += 1;
        }

        emit_progress(
            &app_handle,
            "validation",
            Some(&app_id),
            Some(&app_name),
            total,
            completed,
            succeeded,
            failed,
            if is_valid { "success" } else { "failed" },
            reason.clone().or_else(|| Some("验证通过".to_string())),
        );

        results.push(ValidationResult {
            app_id,
            app_name,
            is_valid,
            reason,
            path_type,
        });
    }

    Ok(results)
}

#[tauri::command]
pub fn init_update_baseline(app_id: String, state: State<AppState>) -> Result<(), String> {
    let (path, item_type) = {
        let config = state.config.lock().unwrap();
        let app = config
            .apps
            .get(&app_id)
            .ok_or_else(|| "应用不存在".to_string())?;
        (app.path.clone(), app.item_type.clone())
    };

    if item_type != "app" {
        return Ok(());
    }

    let (size, modified_time) = crate::utils::app_validator::get_file_metadata(&path)
        .ok_or_else(|| "无法读取文件元数据".to_string())?;

    #[cfg(target_os = "windows")]
    let version = crate::utils::update_checker::get_version_from_registry(&path);

    #[cfg(not(target_os = "windows"))]
    let version: Option<String> = None;

    let mut config = state.config.lock().unwrap();
    let app = config
        .apps
        .get_mut(&app_id)
        .ok_or_else(|| "应用不存在".to_string())?;

    app.update_metadata = Some(UpdateMetadata {
        baseline_version: version,
        baseline_file_size: Some(size),
        baseline_modified_time: Some(modified_time),
        last_checked_at: Some(current_unix_secs()),
        update_status: Some("none".to_string()),
        update_confidence: None,
    });

    crate::utils::config::save_config(&config).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn init_all_baselines(
    app_handle: AppHandle,
    state: State<AppState>,
) -> Result<BatchOperationResult, String> {
    let apps_snapshot = {
        let config = state.config.lock().unwrap();
        config
            .apps
            .iter()
            .filter(|(_, app)| app.item_type == "app")
            .map(|(app_id, app)| {
                (
                    app_id.clone(),
                    app.name.clone(),
                    app.path.clone(),
                    app.update_metadata.is_some(),
                )
            })
            .collect::<Vec<_>>()
    };

    let total = apps_snapshot.len();
    let mut completed = 0;
    let mut succeeded = 0;
    let mut errors = Vec::new();
    let now = current_unix_secs();
    let mut updates = Vec::new();

    for (app_id, app_name, path, already_initialized) in apps_snapshot {
        completed += 1;

        if already_initialized {
            succeeded += 1;
            emit_progress(
                &app_handle,
                "baseline",
                Some(&app_id),
                Some(&app_name),
                total,
                completed,
                succeeded,
                errors.len(),
                "skipped",
                Some("已存在基准数据".to_string()),
            );
            continue;
        }

        if let Some((size, modified_time)) = crate::utils::app_validator::get_file_metadata(&path) {
            #[cfg(target_os = "windows")]
            let version = crate::utils::update_checker::get_version_from_registry(&path);

            #[cfg(not(target_os = "windows"))]
            let version: Option<String> = None;

            updates.push((
                app_id.clone(),
                UpdateMetadata {
                    baseline_version: version,
                    baseline_file_size: Some(size),
                    baseline_modified_time: Some(modified_time),
                    last_checked_at: Some(now),
                    update_status: Some("none".to_string()),
                    update_confidence: None,
                },
            ));
            succeeded += 1;
            emit_progress(
                &app_handle,
                "baseline",
                Some(&app_id),
                Some(&app_name),
                total,
                completed,
                succeeded,
                errors.len(),
                "success",
                Some("基准数据已初始化".to_string()),
            );
        } else {
            errors.push(ErrorInfo {
                app_id: app_id.clone(),
                error: "无法读取文件元数据".to_string(),
            });
            emit_progress(
                &app_handle,
                "baseline",
                Some(&app_id),
                Some(&app_name),
                total,
                completed,
                succeeded,
                errors.len(),
                "failed",
                Some("无法读取文件元数据".to_string()),
            );
        }
    }

    let mut config = state.config.lock().unwrap();
    for (app_id, metadata) in updates {
        if let Some(app) = config.apps.get_mut(&app_id) {
            app.update_metadata = Some(metadata);
        }
    }

    crate::utils::config::save_config(&config).map_err(|e| e.to_string())?;

    Ok(BatchOperationResult {
        total,
        completed,
        succeeded,
        failed: errors.len(),
        errors,
    })
}

#[tauri::command]
pub fn check_app_update(
    app_id: String,
    state: State<AppState>,
) -> Result<UpdateCheckResult, String> {
    let (app_name, path, item_type, metadata) = {
        let config = state.config.lock().unwrap();
        let app = config
            .apps
            .get(&app_id)
            .ok_or_else(|| "应用不存在".to_string())?;
        (
            app.name.clone(),
            app.path.clone(),
            app.item_type.clone(),
            app.update_metadata.clone(),
        )
    };

    if item_type != "app" {
        return Ok(UpdateCheckResult {
            app_id: app_id.clone(),
            app_name,
            has_update: false,
            confidence: "low".to_string(),
            details: UpdateCheckDetails {
                old_version: None,
                new_version: None,
                file_changed: false,
                size_changed: false,
                modified_time_changed: false,
            },
        });
    }

    let result = crate::utils::update_checker::check_for_update(
        &path,
        metadata.as_ref().and_then(|m| m.baseline_version.clone()),
        metadata.as_ref().and_then(|m| m.baseline_file_size),
        metadata.as_ref().and_then(|m| m.baseline_modified_time),
    );

    Ok(UpdateCheckResult {
        app_id: app_id.clone(),
        app_name,
        has_update: result.has_update,
        confidence: result.confidence,
        details: UpdateCheckDetails {
            old_version: result.old_version,
            new_version: result.new_version,
            file_changed: result.file_changed,
            size_changed: result.size_changed,
            modified_time_changed: result.modified_time_changed,
        },
    })
}

#[tauri::command]
pub fn check_all_updates(
    app_handle: AppHandle,
    state: State<AppState>,
) -> Result<Vec<UpdateCheckResult>, String> {
    let apps_snapshot = {
        let config = state.config.lock().unwrap();
        config
            .apps
            .iter()
            .filter(|(_, app)| app.item_type == "app")
            .map(|(app_id, app)| {
                let metadata = app.update_metadata.clone();
                (
                    app_id.clone(),
                    app.name.clone(),
                    app.path.clone(),
                    metadata.and_then(|m| {
                        Some((
                            m.baseline_version,
                            m.baseline_file_size,
                            m.baseline_modified_time,
                        ))
                    }),
                )
            })
            .collect::<Vec<_>>()
    };

    let total = apps_snapshot.len();
    let mut completed = 0;
    let mut succeeded = 0;
    let mut detected_updates = 0;
    let mut results = Vec::with_capacity(total);

    for (app_id, app_name, path, metadata) in apps_snapshot {
        completed += 1;
        let (baseline_version, baseline_size, baseline_modified_time) =
            metadata.unwrap_or((None, None, None));
        let result = crate::utils::update_checker::check_for_update(
            &path,
            baseline_version,
            baseline_size,
            baseline_modified_time,
        );

        if result.has_update {
            detected_updates += 1;
        }
        succeeded += 1;

        emit_progress(
            &app_handle,
            "update",
            Some(&app_id),
            Some(&app_name),
            total,
            completed,
            succeeded,
            detected_updates,
            if result.has_update {
                "warning"
            } else {
                "success"
            },
            Some(if result.has_update {
                "发现疑似更新".to_string()
            } else {
                "未发现更新".to_string()
            }),
        );

        results.push(UpdateCheckResult {
            app_id,
            app_name,
            has_update: result.has_update,
            confidence: result.confidence,
            details: UpdateCheckDetails {
                old_version: result.old_version,
                new_version: result.new_version,
                file_changed: result.file_changed,
                size_changed: result.size_changed,
                modified_time_changed: result.modified_time_changed,
            },
        });
    }

    Ok(results)
}

#[tauri::command]
pub fn batch_delete_apps(
    app_handle: AppHandle,
    app_ids: Vec<String>,
    state: State<AppState>,
) -> Result<BatchOperationResult, String> {
    let mut config = state.config.lock().unwrap();
    let total = app_ids.len();
    let mut completed = 0;
    let mut succeeded = 0;
    let mut errors = Vec::new();

    for app_id in app_ids {
        completed += 1;

        if let Some(app) = config.apps.remove(&app_id) {
            let app_name = app.name.clone();
            for category in config.categories.values_mut() {
                category.apps.retain(|id| id != &app_id);
            }

            if let Some(ref icon_filename) = app.icon {
                if !icon_filename.starts_with("data:") {
                    let icon_path = crate::utils::config::get_icon_path(icon_filename);
                    let _ = std::fs::remove_file(icon_path);
                }
            }

            succeeded += 1;
            emit_progress(
                &app_handle,
                "delete",
                Some(&app_id),
                Some(&app_name),
                total,
                completed,
                succeeded,
                errors.len(),
                "success",
                Some("已删除".to_string()),
            );
        } else {
            errors.push(ErrorInfo {
                app_id: app_id.clone(),
                error: "应用不存在".to_string(),
            });
            emit_progress(
                &app_handle,
                "delete",
                Some(&app_id),
                None,
                total,
                completed,
                succeeded,
                errors.len(),
                "failed",
                Some("应用不存在".to_string()),
            );
        }
    }

    crate::utils::config::save_config(&config).map_err(|e| e.to_string())?;

    Ok(BatchOperationResult {
        total,
        completed,
        succeeded,
        failed: errors.len(),
        errors,
    })
}
