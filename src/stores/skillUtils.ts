/**
 * Utility functions for skills-manager
 */

/**
 * Windows reserved names that cannot be used as file/directory names
 */
const WINDOWS_RESERVED_NAMES = [
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
];

/**
 * Check if a name is a Windows reserved name
 */
function isWindowsReservedName(name: string): boolean {
  const upper = name.toUpperCase();
  // Check exact match
  if (WINDOWS_RESERVED_NAMES.includes(upper)) {
    return true;
  }
  // Check with extension (e.g., CON.txt, NUL.md)
  const base = upper.split('.')[0];
  if (WINDOWS_RESERVED_NAMES.includes(base)) {
    return true;
  }
  return false;
}

/**
 * Validates if a path is a safe relative path (not absolute, no parent directory traversal)
 */
export function isSafeRelativePath(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/") || /^[A-Za-z]:/i.test(trimmed) || trimmed.startsWith("\\")) {
    return false;
  }
  const parts = trimmed.split(/[\\/]+/);
  if (parts.some((part) => part === ".." || part === "")) {
    return false;
  }
  // Check for Windows reserved names in any path component
  if (parts.some((part) => isWindowsReservedName(part))) {
    return false;
  }
  // Check for control characters
  if (/[\x00-\x1f\x7f]/.test(trimmed)) {
    return false;
  }
  return true;
}


/**
 * Checks if a path is a WSL UNC path
 * Examples: \\wsl$\Ubuntu\..., \\wsl.localhost\Ubuntu\...
 */
function isWslPath(input: string): boolean {
  const trimmed = input.trim().toLowerCase();
  return trimmed.startsWith("\\\\wsl$\\") || trimmed.startsWith("\\\\wsl.localhost\\");
}

/**
 * Validates if an absolute path is safe to use
 * - Unix absolute paths: /home/user/...
 * - Windows absolute paths: C:\Users\...
 * - WSL UNC paths: \\wsl$\Ubuntu\... or \\wsl.localhost\Ubuntu\...
 */
export function isSafeAbsolutePath(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;

  // WSL UNC paths
  if (isWslPath(trimmed)) {
    return true;
  }

  // Unix absolute path
  if (trimmed.startsWith("/")) {
    // Disallow dangerous paths
    const dangerous = ["/etc", "/sys", "/proc", "/dev", "/root"];
    return !dangerous.some((d) => trimmed === d || trimmed.startsWith(d + "/"));
  }

  // Windows absolute path (e.g., C:\...)
  if (/^[A-Za-z]:[/\\]/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Validates a path - supports both relative and absolute paths
 */
export function isValidIdePath(input: string): boolean {
  return isSafeRelativePath(input) || isSafeAbsolutePath(input);
}

/**
 * Extracts error message from unknown error type
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const maybeMessage = (err as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage;
  }
  return fallback;
}

/**
 * Normalizes a skill name for stable matching across sources and local paths
 */
export function normalizeSkillName(input: string): string {
  return decodeURIComponent(input)
    .trim()
    .toLowerCase()
    .replace(/\.git$/i, "")
    .replace(/\.zip$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type ManualSkillSourceKind = "github_repo" | "github_tree" | "zip";

export type ManualSkillSource = {
  kind: ManualSkillSourceKind;
  normalizedUrl: string;
  inferredName: string;
};

function normalizeManualSkillName(name: string): string {
  return decodeURIComponent(name)
    .trim()
    .replace(/\.git$/i, "")
    .replace(/\.zip$/i, "");
}

function sanitizeUrl(url: string): URL | null {
  try {
    return new URL(url.trim());
  } catch {
    return null;
  }
}

export function parseManualSkillSource(input: string): ManualSkillSource | null {
  const url = sanitizeUrl(input);
  if (!url || !/^https?:$/.test(url.protocol)) return null;

  const rawPath = url.pathname.replace(/\/+$/, "");
  const segments = rawPath.split("/").filter(Boolean);

  if (url.hostname === "github.com") {
    if (segments.length < 2) return null;
    const repo = normalizeManualSkillName(segments[1]);
    if (!repo) return null;

    if (segments.length === 2) {
      return {
        kind: "github_repo",
        normalizedUrl: `${url.origin}/${segments[0]}/${repo}`,
        inferredName: repo
      };
    }

    if (segments[2] === "tree" && segments.length >= 5) {
      const subpathName = normalizeManualSkillName(segments[segments.length - 1]);
      if (!subpathName) return null;
      return {
        kind: "github_tree",
        normalizedUrl: `${url.origin}/${segments[0]}/${repo}/tree/${segments.slice(3).join("/")}`,
        inferredName: subpathName
      };
    }

    if (segments[2] === "blob") {
      return null;
    }

    return {
      kind: "github_repo",
      normalizedUrl: `${url.origin}/${segments[0]}/${repo}`,
      inferredName: repo
    };
  }

  const lowerPath = rawPath.toLowerCase();
  if (lowerPath.endsWith(".zip")) {
    const fileName = normalizeManualSkillName(segments[segments.length - 1] ?? "");
    if (!fileName) return null;
    return {
      kind: "zip",
      normalizedUrl: url.toString(),
      inferredName: fileName
    };
  }

  return null;
}
