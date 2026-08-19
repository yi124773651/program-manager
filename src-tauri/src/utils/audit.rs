use serde::Serialize;
use std::fs::OpenOptions;
use std::io::Write;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ActionAuditRecord<'a> {
    id: &'a str,
    timestamp: u64,
    source: &'a str,
    action: &'a str,
    target: &'a str,
    status: &'a str,
    confirmed: bool,
    exit_code: Option<i32>,
    output: Option<&'a str>,
    error: Option<&'a str>,
}

fn validate_field(value: &str, field: &str, max_length: usize) -> Result<(), String> {
    if value.is_empty()
        || value.len() > max_length
        || value.chars().any(|character| character.is_control())
    {
        return Err(format!("审计{}无效", field));
    }
    Ok(())
}

fn append_record(record: &ActionAuditRecord<'_>) -> Result<(), String> {
    let path = crate::storage::paths::action_audit_path();
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| format!("打开动作审计日志失败: {}", error))?;
    let line = serde_json::to_string(record)
        .map_err(|error| format!("序列化动作审计日志失败: {}", error))?;
    writeln!(file, "{}", line).map_err(|error| format!("写入动作审计日志失败: {}", error))
}

pub fn start_action(
    source: &str,
    action: &str,
    target: &str,
    confirmed: bool,
) -> Result<String, String> {
    validate_field(source, "来源", 32)?;
    validate_field(action, "动作", 64)?;
    validate_field(target, "目标", 4096)?;
    let id = uuid::Uuid::new_v4().to_string();
    append_record(&ActionAuditRecord {
        id: &id,
        timestamp: crate::storage::json_store::now_millis(),
        source,
        action,
        target,
        status: "started",
        confirmed,
        exit_code: None,
        output: None,
        error: None,
    })?;
    Ok(id)
}

pub fn finish_action(
    id: &str,
    source: &str,
    action: &str,
    target: &str,
    confirmed: bool,
    result: &Result<String, String>,
) -> Result<(), String> {
    let (status, exit_code, output, error) = match result {
        Ok(output) => ("success", Some(0), Some(output.as_str()), None),
        Err(error) => ("failed", Some(-1), None, Some(error.as_str())),
    };
    append_record(&ActionAuditRecord {
        id,
        timestamp: crate::storage::json_store::now_millis(),
        source,
        action,
        target,
        status,
        confirmed,
        exit_code,
        output,
        error,
    })
}

#[cfg(test)]
mod tests {
    use super::{finish_action, start_action};
    use crate::storage::paths;
    use std::fs;

    #[test]
    fn 高风险动作会记录开始和完成结果() {
        let data_dir = std::env::temp_dir().join(format!(
            "program-manager-audit-{}-{}",
            std::process::id(),
            crate::storage::json_store::now_millis()
        ));
        let _guard = paths::set_test_data_dir(data_dir.clone());
        let id = start_action("scene", "close_process", "program-manager", true)
            .expect("应能记录动作开始");
        finish_action(
            &id,
            "scene",
            "close_process",
            "program-manager",
            true,
            &Ok("已结束 1 个进程".to_string()),
        )
        .expect("应能记录动作结果");

        let content =
            fs::read_to_string(data_dir.join(paths::ACTION_AUDIT_FILE)).expect("应能读取审计日志");
        let lines = content.lines().collect::<Vec<_>>();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].contains("\"status\":\"started\""));
        assert!(lines[1].contains("\"status\":\"success\""));

        let _ = fs::remove_dir_all(data_dir);
    }
}
