use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const GITHUB_RELEASES_URL: &str =
    "https://api.github.com/repos/yi124773651/program-manager/releases/latest";
const IMAGE_HOSTS: &[&str] = &[
    "picsum.photos",
    "fastly.picsum.photos",
    "images.unsplash.com",
];

fn https_url(value: &str, field: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| format!("{}格式无效", field))?;
    if url.scheme() != "https" || url.host_str().is_none() {
        return Err(format!("{}必须使用 HTTPS", field));
    }
    Ok(url)
}

fn github_output_url(value: &str, field: &str) -> Result<String, String> {
    let url = https_url(value, field)?;
    let host = url.host_str().unwrap_or_default();
    if host != "github.com" && !host.ends_with(".githubusercontent.com") {
        return Err(format!("{}域名不在 GitHub 允许范围内", field));
    }
    Ok(url.to_string())
}

fn is_allowed_github_url(url: &Url) -> bool {
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    let host = url.host_str().unwrap_or_default();
    host == "api.github.com" || host == "github.com" || host.ends_with(".githubusercontent.com")
}

fn is_allowed_image_url(url: &Url) -> bool {
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port_or_known_default() != Some(443)
    {
        return false;
    }
    let host = url.host_str().unwrap_or_default();
    IMAGE_HOSTS.contains(&host)
}

fn redirect_policy(validator: fn(&Url) -> bool, label: &'static str) -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(move |attempt| {
        if attempt.previous().len() >= 5 {
            return attempt.error(std::io::Error::other(format!("{}重定向次数过多", label)));
        }
        if !validator(attempt.url()) {
            return attempt.error(std::io::Error::other(format!(
                "{}重定向域名不在允许范围内",
                label
            )));
        }
        attempt.follow()
    })
}

fn github_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(15))
        .redirect(redirect_policy(is_allowed_github_url, "GitHub 请求"))
        .user_agent(format!("ProgramManager/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| format!("创建网络客户端失败: {}", error))
}

fn image_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(15))
        .redirect(redirect_policy(is_allowed_image_url, "图片请求"))
        .user_agent(format!("ProgramManager/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| format!("创建网络客户端失败: {}", error))
}

#[tauri::command]
pub async fn fetch_image_as_base64(url: String) -> Result<String, String> {
    let url = https_url(&url, "图片网址")?;
    if !is_allowed_image_url(&url) {
        return Err(format!(
            "图片域名不在允许范围内，仅支持：{}",
            IMAGE_HOSTS.join("、")
        ));
    }
    let response = image_client()?
        .get(url)
        .send()
        .await
        .map_err(|error| format!("获取图片失败: {}", error))?
        .error_for_status()
        .map_err(|error| format!("获取图片失败: {}", error))?;
    if !is_allowed_image_url(response.url()) {
        return Err("图片重定向域名不在允许范围内".to_string());
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !content_type.starts_with("image/") {
        return Err("响应不是图片类型".to_string());
    }

    if response
        .content_length()
        .is_some_and(|length| length > MAX_IMAGE_BYTES as u64)
    {
        return Err("图片超过 10 MB 限制".to_string());
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取图片失败: {}", error))?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("图片超过 10 MB 限制".to_string());
    }

    Ok(format!(
        "data:{};base64,{}",
        content_type,
        BASE64.encode(bytes)
    ))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateInfo {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_url: String,
    pub release_notes: String,
    pub download_url: String,
}

#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    assets: Vec<GitHubAsset>,
}

#[derive(Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

#[tauri::command]
pub async fn check_app_version_update() -> Result<AppUpdateInfo, String> {
    let response: GitHubRelease = github_client()?
        .get(https_url(GITHUB_RELEASES_URL, "更新地址")?)
        .send()
        .await
        .map_err(|error| format!("检查更新失败: {}", error))?
        .error_for_status()
        .map_err(|error| format!("检查更新失败: {}", error))?
        .json()
        .await
        .map_err(|error| format!("解析更新信息失败: {}", error))?;

    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let latest_version = response.tag_name.trim_start_matches('v').to_string();
    let download_url = response
        .assets
        .iter()
        .find(|asset| {
            let name = asset.name.to_ascii_lowercase();
            name.contains("setup") || name.ends_with(".exe")
        })
        .map(|asset| github_output_url(&asset.browser_download_url, "下载地址"))
        .transpose()?
        .unwrap_or_default();

    let release_url = github_output_url(&response.html_url, "发布地址")?;

    Ok(AppUpdateInfo {
        has_update: version_is_newer(&current_version, &latest_version),
        current_version,
        latest_version,
        release_url,
        release_notes: response.body.unwrap_or_default(),
        download_url,
    })
}

fn version_is_newer(current: &str, latest: &str) -> bool {
    let parse = |value: &str| -> Vec<u64> {
        value
            .split('.')
            .map(|part| part.parse().unwrap_or(0))
            .collect()
    };
    let current = parse(current);
    let latest = parse(latest);
    for index in 0..current.len().max(latest.len()) {
        let current_part = current.get(index).copied().unwrap_or(0);
        let latest_part = latest.get(index).copied().unwrap_or(0);
        if latest_part != current_part {
            return latest_part > current_part;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    #[test]
    fn 语义版本比较能识别新版本() {
        assert!(super::version_is_newer("1.1.4", "1.2.0"));
        assert!(!super::version_is_newer("1.2.0", "1.1.9"));
        assert!(!super::version_is_newer("1.2.0", "1.2.0"));
    }

    #[test]
    fn 更新输出地址只接受允许的_https域名() {
        assert!(super::github_output_url("https://github.com/example/release", "发布地址").is_ok());
        assert!(super::github_output_url(
            "https://objects.githubusercontent.com/example.exe",
            "下载地址"
        )
        .is_ok());
        assert!(super::github_output_url("https://example.com/release", "发布地址").is_err());
    }

    #[test]
    fn 背景图片只接受固定_https域名() {
        let allowed = reqwest::Url::parse("https://picsum.photos/1920/1080").unwrap();
        let redirected =
            reqwest::Url::parse("https://fastly.picsum.photos/id/1/1920/1080.jpg").unwrap();
        let denied = reqwest::Url::parse("https://example.com/image.jpg").unwrap();
        let credentialed = reqwest::Url::parse("https://user@example.com/image.jpg").unwrap();

        assert!(super::is_allowed_image_url(&allowed));
        assert!(super::is_allowed_image_url(&redirected));
        assert!(!super::is_allowed_image_url(&denied));
        assert!(!super::is_allowed_image_url(&credentialed));
    }
}
