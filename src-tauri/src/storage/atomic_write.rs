use crate::storage::error::StorageError;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

pub fn write_atomic(path: &Path, content: &[u8]) -> Result<(), StorageError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let tmp_path = path.with_extension("tmp");
    {
        let mut file = File::create(&tmp_path)?;
        file.write_all(content)?;
        file.sync_all()?;
    }

    if path.exists() {
        fs::remove_file(path)?;
    }
    fs::rename(tmp_path, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::write_atomic;
    use std::fs;

    #[test]
    fn 原子写入会创建目标文件并保留内容() {
        let dir = std::env::temp_dir().join(format!(
            "program-manager-atomic-test-{}",
            std::process::id()
        ));
        let _ = fs::create_dir_all(&dir);
        let file = dir.join("data.json");

        write_atomic(&file, br#"{"ok":true}"#).expect("写入应成功");

        let content = fs::read_to_string(&file).expect("应能读取文件");
        assert_eq!(content, r#"{"ok":true}"#);
        let _ = fs::remove_dir_all(dir);
    }
}
