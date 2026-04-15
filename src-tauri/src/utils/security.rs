use std::path::{Component, Path, PathBuf};

pub fn is_safe_relative_dir(rel: &str) -> bool {
    let trimmed = rel.trim();
    if trimmed.is_empty() {
        return false;
    }
    let path = Path::new(trimmed);
    if path.is_absolute() {
        return false;
    }
    for comp in path.components() {
        match comp {
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return false,
            _ => {}
        }
    }
    true
}

/// Checks if a path is a WSL UNC path
/// Examples: \\wsl$\Ubuntu\..., \\wsl.localhost\Ubuntu\...
pub fn is_wsl_path(path: &str) -> bool {
    let lower = path.trim().to_lowercase();
    lower.starts_with("\\\\wsl$\\") || lower.starts_with("\\\\wsl.localhost\\")
}

/// Validates if an absolute path is safe to use
/// - Unix absolute paths: /home/user/...
/// - Windows absolute paths: C:\Users\...
/// - WSL UNC paths: \\wsl$\Ubuntu\... or \\wsl.localhost\Ubuntu\...
pub fn is_safe_absolute_dir(path: &str) -> bool {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return false;
    }

    // WSL UNC paths
    if is_wsl_path(trimmed) {
        return true;
    }

    let p = Path::new(trimmed);
    if !p.is_absolute() {
        return false;
    }

    // On Unix, block dangerous system paths
    #[cfg(target_family = "unix")]
    {
        let dangerous = ["/etc", "/sys", "/proc", "/dev", "/root"];
        for d in dangerous {
            if trimmed == d || trimmed.starts_with(&format!("{}/", d)) {
                return false;
            }
        }
    }

    true
}

/// Validates a path - supports both relative and absolute paths
pub fn is_valid_ide_path(path: &str) -> bool {
    is_safe_relative_dir(path) || is_safe_absolute_dir(path)
}

/// Checks if the path is an absolute path (including WSL UNC)
pub fn is_absolute_ide_path(path: &str) -> bool {
    is_safe_absolute_dir(path)
}

pub fn is_within_directory(base: &Path, target: &Path) -> bool {
    let canonical_base = base.canonicalize().unwrap_or_else(|_| base.to_path_buf());

    let normalized_target = target.components().fold(PathBuf::new(), |mut acc, part| {
        if part == Component::ParentDir {
            acc.pop();
        } else if part != Component::CurDir {
            acc.push(part);
        }
        acc
    });

    let resolved_target = if target.is_absolute() {
        normalized_target
    } else {
        canonical_base.join(normalized_target)
    };

    resolved_target.starts_with(&canonical_base)
}
