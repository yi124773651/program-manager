use std::ffi::OsString;
use std::fs;
use std::path::PathBuf;

#[cfg(test)]
use std::cell::RefCell;

pub const CONFIG_FILE: &str = "config.json";
pub const SCENES_FILE: &str = "scenes.json";
pub const NOTES_FILE: &str = "notes.json";
pub const TODOS_FILE: &str = "todos.json";
pub const CLIPBOARD_FILE: &str = "clipboard.json";
pub const ACTIONS_FILE: &str = "actions.json";
pub const MIGRATIONS_FILE: &str = "migrations.json";
const DATA_DIR_ENV: &str = "PROGRAM_MANAGER_DATA_DIR";

#[cfg(test)]
thread_local! {
    static TEST_DATA_DIR: RefCell<Option<PathBuf>> = RefCell::new(None);
}

#[cfg(test)]
pub struct TestDataDirGuard {
    previous: Option<PathBuf>,
}

#[cfg(test)]
impl Drop for TestDataDirGuard {
    fn drop(&mut self) {
        TEST_DATA_DIR.with(|cell| {
            cell.replace(self.previous.take());
        });
    }
}

#[cfg(test)]
pub fn set_test_data_dir(dir: PathBuf) -> TestDataDirGuard {
    let previous = TEST_DATA_DIR.with(|cell| cell.replace(Some(dir)));
    TestDataDirGuard { previous }
}

pub fn data_dir() -> PathBuf {
    #[cfg(test)]
    if let Some(dir) = TEST_DATA_DIR.with(|cell| cell.borrow().clone()) {
        let _ = fs::create_dir_all(&dir);
        return dir;
    }

    if let Some(dir) = env_data_dir() {
        let _ = fs::create_dir_all(&dir);
        return dir;
    }

    let dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("program-manager");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn env_data_dir() -> Option<PathBuf> {
    env_data_dir_from(std::env::var_os(DATA_DIR_ENV))
}

fn env_data_dir_from(value: Option<OsString>) -> Option<PathBuf> {
    value
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
}

pub fn data_file(name: &str) -> PathBuf {
    data_dir().join(name)
}

pub fn config_path() -> PathBuf {
    data_file(CONFIG_FILE)
}

pub fn scenes_path() -> PathBuf {
    data_file(SCENES_FILE)
}

pub fn notes_path() -> PathBuf {
    data_file(NOTES_FILE)
}

pub fn todos_path() -> PathBuf {
    data_file(TODOS_FILE)
}

pub fn clipboard_path() -> PathBuf {
    data_file(CLIPBOARD_FILE)
}

pub fn actions_path() -> PathBuf {
    data_file(ACTIONS_FILE)
}

pub fn migrations_path() -> PathBuf {
    data_file(MIGRATIONS_FILE)
}

pub fn icons_dir() -> PathBuf {
    let dir = data_dir().join("icons");
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn backups_dir() -> PathBuf {
    let dir = data_dir().join("backups");
    let _ = fs::create_dir_all(&dir);
    dir
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 环境变量数据目录会忽略空值() {
        assert!(env_data_dir_from(None).is_none());
        assert!(env_data_dir_from(Some(OsString::new())).is_none());
    }

    #[test]
    fn 环境变量数据目录会解析为路径() {
        let expected = PathBuf::from(r"D:\program-manager-smoke-data");

        assert_eq!(
            env_data_dir_from(Some(expected.clone().into_os_string())),
            Some(expected)
        );
    }
}
