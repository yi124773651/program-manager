use crate::storage::atomic_write::write_atomic;
use crate::storage::error::StorageError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataEnvelope<T> {
    pub schema_version: u32,
    pub updated_at: u64,
    pub data: T,
}

pub fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn read_json<T>(path: &Path) -> Result<T, StorageError>
where
    T: for<'de> Deserialize<'de>,
{
    let content = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&content)?)
}

pub fn write_json<T>(path: &Path, value: &T) -> Result<(), StorageError>
where
    T: Serialize,
{
    let content = serde_json::to_vec_pretty(value)?;
    write_atomic(path, &content)
}

pub fn write_enveloped_json<T>(
    path: &Path,
    schema_version: u32,
    data: T,
) -> Result<(), StorageError>
where
    T: Serialize,
{
    let envelope = DataEnvelope {
        schema_version,
        updated_at: now_millis(),
        data,
    };
    write_json(path, &envelope)
}

pub fn read_enveloped_json<T>(path: &Path) -> Result<DataEnvelope<T>, StorageError>
where
    T: for<'de> Deserialize<'de>,
{
    read_json(path)
}

#[cfg(test)]
mod tests {
    use super::{read_enveloped_json, write_enveloped_json, DataEnvelope};
    use serde_json::json;
    use std::fs;

    #[test]
    fn 可以读写统一数据外壳() {
        let dir = std::env::temp_dir().join(format!(
            "program-manager-json-store-test-{}",
            std::process::id()
        ));
        let _ = fs::create_dir_all(&dir);
        let file = dir.join("scenes.json");

        write_enveloped_json(&file, 1, json!({ "scenes": [] })).expect("写入应成功");
        let envelope: DataEnvelope<serde_json::Value> =
            read_enveloped_json(&file).expect("读取应成功");

        assert_eq!(envelope.schema_version, 1);
        assert!(envelope.updated_at > 0);
        assert_eq!(envelope.data["scenes"].as_array().unwrap().len(), 0);
        let _ = fs::remove_dir_all(dir);
    }
}
