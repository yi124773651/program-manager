use crate::models::AppState;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use std::net::IpAddr;
use std::time::Duration;
use tauri::State;

const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const GITHUB_RELEASES_URL: &str =
    "https://api.github.com/repos/yi124773651/program-manager/releases/latest";
/// 开箱即用的内置图床域名；用户在设置中授权的域名会追加在其后。
const DEFAULT_IMAGE_HOSTS: &[&str] = &[
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

/// 拒绝环回、私有网段、链路本地（含云 metadata 169.254.169.254）等非公网地址，
/// 避免图床接口被当作探测内网的 SSRF 通道。
fn is_blocked_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ipv4) => {
            ipv4.is_loopback()
                || ipv4.is_private()
                || ipv4.is_link_local()
                || ipv4.is_broadcast()
                || ipv4.is_documentation()
                || ipv4.is_unspecified()
                || ipv4.is_multicast()
                // 100.64.0.0/10 运营商级 NAT
                || (ipv4.octets()[0] == 100 && (64..128).contains(&ipv4.octets()[1]))
                // 192.0.0.0/24 IETF 协议分配
                || (ipv4.octets()[0] == 192 && ipv4.octets()[1] == 0 && ipv4.octets()[2] == 0)
                // 198.18.0.0/15 基准测试
                || (ipv4.octets()[0] == 198 && (18..20).contains(&ipv4.octets()[1]))
        }
        IpAddr::V6(ipv6) => {
            ipv6.is_loopback()
                || ipv6.is_unspecified()
                || ipv6.is_multicast()
                // fc00::/7 唯一本地地址
                || (ipv6.segments()[0] & 0xfe00) == 0xfc00
                // fe80::/10 链路本地
                || (ipv6.segments()[0] & 0xffc0) == 0xfe80
                // IPv4 映射/兼容地址需按其内嵌的 IPv4 语义再判一次
                || ipv6
                    .to_ipv4_mapped()
                    .or_else(|| ipv6.to_ipv4())
                    .is_some_and(|mapped| is_blocked_ip(IpAddr::V4(mapped)))
        }
    }
}

/// 主机名形态若本身就是字面 IP，直接按 IP 规则判定。
fn host_is_blocked_ip(host: &str) -> bool {
    // URL 中的 IPv6 主机带方括号，解析前需剥离。
    let candidate = host.strip_prefix('[').unwrap_or(host);
    let candidate = candidate.strip_suffix(']').unwrap_or(candidate);
    candidate.parse::<IpAddr>().is_ok_and(is_blocked_ip)
}

fn is_allowed_github_url(url: &Url) -> bool {
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    let host = url.host_str().unwrap_or_default();
    host == "api.github.com" || host == "github.com" || host.ends_with(".githubusercontent.com")
}

/// 图片地址校验：固定 HTTPS/443、禁止携带凭据、拒绝非公网地址，
/// 且主机必须在内置默认域名或用户显式授权的域名之内。
fn is_allowed_image_url(url: &Url, trusted_hosts: &[String]) -> bool {
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port_or_known_default() != Some(443)
    {
        return false;
    }
    let host = url.host_str().unwrap_or_default();
    if host.is_empty() || host_is_blocked_ip(host) {
        return false;
    }
    DEFAULT_IMAGE_HOSTS.contains(&host)
        || trusted_hosts
            .iter()
            .any(|trusted| trusted.eq_ignore_ascii_case(host))
}

fn redirect_policy(
    validator: impl Fn(&Url) -> bool + Send + Sync + 'static,
    label: &'static str,
) -> reqwest::redirect::Policy {
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

fn image_client(trusted_hosts: Vec<String>) -> Result<Client, String> {
    Client::builder()
        // 随机图床常见慢速大图（实测 9-45 KB/s、单图可达 1.2 MB，最坏耗时超过 80 秒），
        // 总超时按最坏情况留足余量；连接超时单独收紧，避免不可达地址长时间挂起。
        .timeout(Duration::from_secs(180))
        .connect_timeout(Duration::from_secs(10))
        .redirect(redirect_policy(
            move |url: &Url| is_allowed_image_url(url, &trusted_hosts),
            "图片请求",
        ))
        .user_agent(format!("ProgramManager/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| format!("创建网络客户端失败: {}", error))
}

#[tauri::command]
pub async fn fetch_image_as_base64(
    url: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // MutexGuard 不是 Send，必须在首个 .await 之前取完并释放。
    let trusted_hosts = {
        let config = state.config.lock().unwrap();
        config
            .settings
            .trusted_image_hosts
            .clone()
            .unwrap_or_default()
    };

    fetch_image_with_hosts(&url, &trusted_hosts).await
}

/// reqwest 顶层 Display 常常只有 "error sending request" 这类无信息量文本，
/// 真实原因（超时、连接被拒、TLS 失败、代理不可用）藏在 source 链里，需逐层展开。
fn describe_request_error(error: &reqwest::Error) -> String {
    let mut parts = vec![error.to_string()];

    let mut source = std::error::Error::source(error);
    while let Some(current) = source {
        let text = current.to_string();
        // 相邻层级常重复同一句描述，去重后更易读
        if !parts.iter().any(|existing| existing == &text) {
            parts.push(text);
        }
        source = current.source();
    }

    if error.is_timeout() {
        parts.push("（超时，图床响应过慢）".to_string());
    }
    if error.is_connect() {
        parts.push("（无法建立连接，请检查网络或系统代理设置）".to_string());
    }

    parts.join(" -> ")
}

/// 图片下载的实际逻辑；与 Tauri State 解耦，便于直接测试真实网络路径。
async fn fetch_image_with_hosts(url: &str, trusted_hosts: &[String]) -> Result<String, String> {
    let url = https_url(url, "图片网址")?;
    if !is_allowed_image_url(&url, trusted_hosts) {
        return Err(format!(
            "图片域名不在允许范围内。内置支持：{}；其他域名需先在设置中确认授权，且不能是内网地址",
            DEFAULT_IMAGE_HOSTS.join("、")
        ));
    }
    let response = image_client(trusted_hosts.to_vec())?
        .get(url)
        .send()
        .await
        .map_err(|error| format!("获取图片失败: {}", describe_request_error(&error)))?
        .error_for_status()
        .map_err(|error| format!("获取图片失败: {}", describe_request_error(&error)))?;
    if !is_allowed_image_url(response.url(), trusted_hosts) {
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
        .map_err(|error| format!("读取图片失败: {}", describe_request_error(&error)))?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("图片超过 10 MB 限制".to_string());
    }

    // 部分图床声明的 Content-Type 与实际字节不一致（实测有服务器称 PNG 实发 JPEG），
    // 按魔数判定真实格式，避免写出错误的 data URL 前缀导致渲染失败。
    let actual_type =
        sniff_image_mime(&bytes).ok_or_else(|| "响应内容不是可识别的图片格式".to_string())?;

    Ok(format!(
        "data:{};base64,{}",
        actual_type,
        BASE64.encode(bytes)
    ))
}

/// 依据文件头魔数识别图片真实类型，仅放行浏览器可直接渲染的格式。
fn sniff_image_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some("image/png");
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("image/jpeg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    if bytes.len() > 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if bytes.starts_with(b"BM") {
        return Some("image/bmp");
    }
    // AVIF / HEIC 等 ISO-BMFF 容器
    if bytes.len() > 12 && &bytes[4..8] == b"ftyp" {
        let brand = &bytes[8..12];
        if brand == b"avif" || brand == b"avis" {
            return Some("image/avif");
        }
    }
    None
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
    fn 背景图片只接受内置或已授权的_https域名() {
        let no_trust: Vec<String> = Vec::new();
        let allowed = reqwest::Url::parse("https://picsum.photos/1920/1080").unwrap();
        let redirected =
            reqwest::Url::parse("https://fastly.picsum.photos/id/1/1920/1080.jpg").unwrap();
        let denied = reqwest::Url::parse("https://example.com/image.jpg").unwrap();
        let credentialed = reqwest::Url::parse("https://user@example.com/image.jpg").unwrap();
        let plain_http = reqwest::Url::parse("http://picsum.photos/1920/1080").unwrap();

        assert!(super::is_allowed_image_url(&allowed, &no_trust));
        assert!(super::is_allowed_image_url(&redirected, &no_trust));
        assert!(!super::is_allowed_image_url(&denied, &no_trust));
        assert!(!super::is_allowed_image_url(&credentialed, &no_trust));
        assert!(!super::is_allowed_image_url(&plain_http, &no_trust));
    }

    #[test]
    fn 用户授权过的图床域名会放行且不区分大小写() {
        let trusted = vec!["img.qlqqs.com".to_string()];
        let authorized = reqwest::Url::parse("https://img.qlqqs.com/random").unwrap();
        let mixed_case = reqwest::Url::parse("https://IMG.QLQQS.COM/random").unwrap();
        let other = reqwest::Url::parse("https://img.other.com/random").unwrap();

        assert!(super::is_allowed_image_url(&authorized, &trusted));
        assert!(super::is_allowed_image_url(&mixed_case, &trusted));
        assert!(!super::is_allowed_image_url(&other, &trusted));
        // 未授权前同一域名必须被拒绝
        assert!(!super::is_allowed_image_url(&authorized, &[]));
    }

    #[test]
    fn 内网与环回地址即使被授权也会被拒绝() {
        // 用户可能误把内网地址填进授权列表，IP 规则必须优先于授权列表。
        let trusted = vec![
            "127.0.0.1".to_string(),
            "192.168.1.1".to_string(),
            "10.0.0.5".to_string(),
            "169.254.169.254".to_string(),
            "[::1]".to_string(),
        ];

        for raw in [
            "https://127.0.0.1/x.jpg",
            "https://192.168.1.1/x.jpg",
            "https://10.0.0.5/x.jpg",
            "https://172.16.0.1/x.jpg",
            "https://169.254.169.254/latest/meta-data",
            "https://[::1]/x.jpg",
            "https://[fd00::1]/x.jpg",
            "https://[fe80::1]/x.jpg",
            "https://0.0.0.0/x.jpg",
            "https://100.64.0.1/x.jpg",
        ] {
            let url = reqwest::Url::parse(raw).unwrap();
            assert!(
                !super::is_allowed_image_url(&url, &trusted),
                "内网地址应被拒绝: {}",
                raw
            );
        }
    }

    #[test]
    fn 公网地址在授权后可以通过_ip_校验() {
        let trusted = vec!["93.184.216.34".to_string()];
        let public = reqwest::Url::parse("https://93.184.216.34/x.jpg").unwrap();

        assert!(super::is_allowed_image_url(&public, &trusted));
    }

    #[test]
    fn 内嵌_ipv4_的_ipv6_地址也会按内网规则拒绝() {
        assert!(super::host_is_blocked_ip("[::ffff:127.0.0.1]"));
        assert!(super::host_is_blocked_ip("[::ffff:192.168.0.1]"));
        assert!(!super::host_is_blocked_ip("[::ffff:93.184.216.34]"));
        assert!(!super::host_is_blocked_ip("picsum.photos"));
    }

    #[test]
    fn 按魔数识别图片真实类型并拒绝非图片内容() {
        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0x00];
        let jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 0x00];
        let gif = b"GIF89a\x00\x00";
        let mut webp = Vec::from(*b"RIFF____WEBPVP8 ");
        webp.extend_from_slice(&[0u8; 4]);

        assert_eq!(super::sniff_image_mime(&png), Some("image/png"));
        assert_eq!(super::sniff_image_mime(&jpeg), Some("image/jpeg"));
        assert_eq!(super::sniff_image_mime(gif), Some("image/gif"));
        assert_eq!(super::sniff_image_mime(&webp), Some("image/webp"));

        // 服务器声明 PNG 但实发 JPEG 时，必须按真实字节返回 jpeg
        assert_eq!(super::sniff_image_mime(&jpeg), Some("image/jpeg"));
        // HTML 错误页等非图片内容必须被拒绝
        assert_eq!(super::sniff_image_mime(b"<!DOCTYPE html><html>"), None);
        assert_eq!(super::sniff_image_mime(b""), None);
    }

    /// 真实网络用例：验证内置域名的完整下载链路（含重定向逐跳校验）。
    /// 依赖外部网络，默认跳过；手动验证时执行 `cargo test -- --ignored --nocapture`。
    #[ignore = "依赖外部网络"]
    #[tokio::test]
    async fn 内置图床可以完成真实下载() {
        let result = super::fetch_image_with_hosts("https://picsum.photos/200/200", &[]).await;

        let data_url = result.expect("内置域名应能下载成功");
        assert!(
            data_url.starts_with("data:image/"),
            "返回值应是图片 data URL，实际: {}",
            &data_url[..data_url.len().min(40)]
        );
    }

    /// 真实网络用例：未授权域名必须在发起请求前被拒绝。
    #[ignore = "依赖外部网络"]
    #[tokio::test]
    async fn 未授权域名会在请求前被拒绝() {
        let result = super::fetch_image_with_hosts("https://example.com/x.jpg", &[]).await;

        let error = result.expect_err("未授权域名应被拒绝");
        assert!(
            error.contains("图片域名不在允许范围内"),
            "实际错误: {}",
            error
        );
    }
}
