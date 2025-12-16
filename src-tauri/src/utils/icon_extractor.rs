use image::{ImageBuffer, Rgba};
use std::fs;

/// 提取图标并保存到文件，返回图标文件名
#[cfg(target_os = "windows")]
pub fn extract_icon_to_file(exe_path: &str, app_id: &str) -> Result<String, String> {
    use std::os::windows::ffi::OsStrExt;
    use std::ffi::OsStr;
    use windows::Win32::UI::Shell::ExtractIconW;
    use windows::Win32::UI::WindowsAndMessaging::{GetIconInfo, DestroyIcon, ICONINFO};
    use windows::Win32::Graphics::Gdi::{
        GetDIBits, GetObjectW, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
        DeleteObject, CreateCompatibleDC, DeleteDC, DIB_RGB_COLORS, BITMAP
    };
    use windows::Win32::Foundation::HINSTANCE;
    use windows::core::PWSTR;

    // 将路径转换为 UTF-16
    let path_wide: Vec<u16> = OsStr::new(exe_path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        // 提取图标
        let hicon = ExtractIconW(
            HINSTANCE::default(),
            PWSTR(path_wide.as_ptr() as *mut u16),
            0
        );

        if hicon.is_invalid() {
            return Err("无法提取图标".to_string());
        }

        // 获取图标信息
        let mut icon_info = ICONINFO::default();
        if GetIconInfo(hicon, &mut icon_info).is_err() {
            let _ = DestroyIcon(hicon);
            return Err("无法获取图标信息".to_string());
        }

        // 获取位图尺寸
        let mut bm = BITMAP::default();
        GetObjectW(
            icon_info.hbmColor,
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bm as *mut _ as *mut _)
        );

        let width = bm.bmWidth.abs() as u32;
        let height = bm.bmHeight.abs() as u32;

        // 如果无法获取尺寸，使用默认值
        let (width, height) = if width == 0 || height == 0 {
            (32, 32)
        } else {
            (width, height)
        };

        // 获取位图数据
        let mut bmp_info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                biHeight: -(height as i32), // 负值表示从上到下
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        // 创建缓冲区
        let buffer_size = (width * height * 4) as usize;
        let mut pixels: Vec<u8> = vec![0; buffer_size];

        // 获取颜色位图数据
        let hdc = CreateCompatibleDC(None);
        let result = GetDIBits(
            hdc,
            icon_info.hbmColor,
            0,
            height,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bmp_info,
            DIB_RGB_COLORS
        );

        // 如果获取失败
        if result == 0 {
            let _ = DeleteObject(icon_info.hbmColor);
            let _ = DeleteObject(icon_info.hbmMask);
            let _ = DestroyIcon(hicon);
            let _ = DeleteDC(hdc);
            return Err("无法获取位图数据".to_string());
        }

        // 处理 alpha 通道 - 从遮罩位图获取
        let mut mask_pixels: Vec<u8> = vec![0; buffer_size];
        GetDIBits(
            hdc,
            icon_info.hbmMask,
            0,
            height,
            Some(mask_pixels.as_mut_ptr() as *mut _),
            &mut bmp_info,
            DIB_RGB_COLORS
        );

        // 转换 BGRA 到 RGBA，并应用 alpha 通道
        for i in (0..pixels.len()).step_by(4) {
            // B <-> R
            pixels.swap(i, i + 2);

            // 如果原始 alpha 为 0，使用遮罩来设置 alpha
            if pixels[i + 3] == 0 {
                // 遮罩中黑色 (0) 表示不透明，白色 (255) 表示透明
                let mask_value = mask_pixels.get(i).copied().unwrap_or(0);
                pixels[i + 3] = 255 - mask_value;
            }
        }

        // 清理资源
        let _ = DeleteObject(icon_info.hbmColor);
        let _ = DeleteObject(icon_info.hbmMask);
        let _ = DestroyIcon(hicon);
        let _ = DeleteDC(hdc);

        // 创建图像
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::from_raw(width, height, pixels)
            .ok_or_else(|| "Failed to create image buffer".to_string())?;

        // 编码为 PNG
        let mut png_data: Vec<u8> = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut png_data), image::ImageFormat::Png)
            .map_err(|e| format!("Failed to encode PNG: {}", e))?;

        // 保存到文件
        let icon_filename = format!("{}.png", app_id);
        let icon_path = crate::utils::config::get_icon_path(&icon_filename);

        fs::write(&icon_path, &png_data)
            .map_err(|e| format!("Failed to save icon: {}", e))?;

        Ok(icon_filename)
    }
}

#[cfg(not(target_os = "windows"))]
pub fn extract_icon_to_file(_exe_path: &str, _app_id: &str) -> Result<String, String> {
    Err("图标提取仅支持 Windows".to_string())
}

/// 兼容旧接口：提取图标并返回 base64（已弃用，仅用于兼容）
#[cfg(target_os = "windows")]
pub fn extract_icon_from_exe(exe_path: &str) -> Result<String, String> {
    use std::os::windows::ffi::OsStrExt;
    use std::ffi::OsStr;
    use windows::Win32::UI::Shell::ExtractIconW;
    use windows::Win32::UI::WindowsAndMessaging::{GetIconInfo, DestroyIcon, ICONINFO};
    use windows::Win32::Graphics::Gdi::{
        GetDIBits, GetObjectW, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
        DeleteObject, CreateCompatibleDC, DeleteDC, DIB_RGB_COLORS, BITMAP
    };
    use windows::Win32::Foundation::HINSTANCE;
    use windows::core::PWSTR;

    // 将路径转换为 UTF-16
    let path_wide: Vec<u16> = OsStr::new(exe_path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        // 提取图标
        let hicon = ExtractIconW(
            HINSTANCE::default(),
            PWSTR(path_wide.as_ptr() as *mut u16),
            0
        );

        if hicon.is_invalid() {
            return Ok(get_placeholder_icon());
        }

        // 获取图标信息
        let mut icon_info = ICONINFO::default();
        if GetIconInfo(hicon, &mut icon_info).is_err() {
            let _ = DestroyIcon(hicon);
            return Ok(get_placeholder_icon());
        }

        // 获取位图尺寸
        let mut bm = BITMAP::default();
        GetObjectW(
            icon_info.hbmColor,
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bm as *mut _ as *mut _)
        );

        let width = bm.bmWidth.abs() as u32;
        let height = bm.bmHeight.abs() as u32;

        // 如果无法获取尺寸，使用默认值
        let (width, height) = if width == 0 || height == 0 {
            (32, 32)
        } else {
            (width, height)
        };

        // 获取位图数据
        let mut bmp_info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                biHeight: -(height as i32), // 负值表示从上到下
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        // 创建缓冲区
        let buffer_size = (width * height * 4) as usize;
        let mut pixels: Vec<u8> = vec![0; buffer_size];

        // 获取颜色位图数据
        let hdc = CreateCompatibleDC(None);
        let result = GetDIBits(
            hdc,
            icon_info.hbmColor,
            0,
            height,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bmp_info,
            DIB_RGB_COLORS
        );

        // 如果获取失败，尝试获取遮罩位图
        if result == 0 {
            let _ = DeleteObject(icon_info.hbmColor);
            let _ = DeleteObject(icon_info.hbmMask);
            let _ = DestroyIcon(hicon);
            let _ = DeleteDC(hdc);
            return Ok(get_placeholder_icon());
        }

        // 处理 alpha 通道 - 从遮罩位图获取
        let mut mask_pixels: Vec<u8> = vec![0; buffer_size];
        GetDIBits(
            hdc,
            icon_info.hbmMask,
            0,
            height,
            Some(mask_pixels.as_mut_ptr() as *mut _),
            &mut bmp_info,
            DIB_RGB_COLORS
        );

        // 转换 BGRA 到 RGBA，并应用 alpha 通道
        for i in (0..pixels.len()).step_by(4) {
            // B <-> R
            pixels.swap(i, i + 2);

            // 如果原始 alpha 为 0，使用遮罩来设置 alpha
            if pixels[i + 3] == 0 {
                // 遮罩中黑色 (0) 表示不透明，白色 (255) 表示透明
                let mask_value = mask_pixels.get(i).copied().unwrap_or(0);
                pixels[i + 3] = 255 - mask_value;
            }
        }

        // 清理资源
        let _ = DeleteObject(icon_info.hbmColor);
        let _ = DeleteObject(icon_info.hbmMask);
        let _ = DestroyIcon(hicon);
        let _ = DeleteDC(hdc);

        // 创建图像
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::from_raw(width, height, pixels)
            .ok_or_else(|| "Failed to create image buffer".to_string())?;

        // 编码为 PNG
        let mut png_data: Vec<u8> = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut png_data), image::ImageFormat::Png)
            .map_err(|e| format!("Failed to encode PNG: {}", e))?;

        // 转换为 base64
        use base64::Engine;
        let base64_string = base64::engine::general_purpose::STANDARD.encode(&png_data);

        Ok(format!("data:image/png;base64,{}", base64_string))
    }
}

#[cfg(not(target_os = "windows"))]
pub fn extract_icon_from_exe(_exe_path: &str) -> Result<String, String> {
    Ok(get_placeholder_icon())
}

// 返回一个简单的占位图标 (1x1 透明 PNG)
fn get_placeholder_icon() -> String {
    use base64::Engine;

    // 1x1 透明 PNG 的字节数据
    let png_bytes = vec![
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
        0x42, 0x60, 0x82,
    ];

    format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&png_bytes)
    )
}
