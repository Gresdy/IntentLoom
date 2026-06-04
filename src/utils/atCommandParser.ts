/**
 * Shared @ command parser for file references
 * 共享的 @ 命令解析器，用于文件引用
 */

export interface AtCommandPart {
  type: "text" | "atPath";
  content: string;
}

/**
 * Simple unescape function for @ paths
 * 简单的转义处理函数
 */
function unescapeAtPath(rawPath: string): string {
  const path = rawPath.startsWith("@") ? rawPath.substring(1) : rawPath;
  return path.replace(/\\(.)/g, "$1");
}

/**
 * Parses a query string to find all '@<path>' commands and text segments.
 * Handles \ escaped spaces within paths.
 *
 * 解析查询字符串，找出所有 '@<path>' 命令和文本段。
 * 处理路径中的 \ 转义空格。
 *
 * @example
 * parseAllAtCommands('@file.txt hello @dir/path world')
 * // Returns: [
 * //   { type: 'atPath', content: 'file.txt' },
 * //   { type: 'text', content: 'hello' },
 * //   { type: 'atPath', content: 'dir/path' },
 * //   { type: 'text', content: 'world' }
 * // ]
 */
export function parseAllAtCommands(query: string): AtCommandPart[] {
  const parts: AtCommandPart[] = [];
  let currentIndex = 0;

  while (currentIndex < query.length) {
    let atIndex = -1;
    let nextSearchIndex = currentIndex;

    while (nextSearchIndex < query.length) {
      if (
        query[nextSearchIndex] === "@" &&
        (nextSearchIndex === 0 || query[nextSearchIndex - 1] !== "\\")
      ) {
        atIndex = nextSearchIndex;
        break;
      }
      nextSearchIndex++;
    }

    if (atIndex === -1) {
      if (currentIndex < query.length) {
        parts.push({ type: "text", content: query.substring(currentIndex) });
      }
      break;
    }

    if (atIndex > currentIndex) {
      parts.push({
        type: "text",
        content: query.substring(currentIndex, atIndex),
      });
    }

    let pathEndIndex = atIndex + 1;
    let inEscape = false;
    while (pathEndIndex < query.length) {
      const char = query[pathEndIndex];
      if (inEscape) {
        inEscape = false;
      } else if (char === "\\") {
        inEscape = true;
      } else if (/[,\s;!?()[\]{}]/.test(char)) {
        break;
      } else if (char === ".") {
        const nextChar = pathEndIndex + 1 < query.length ? query[pathEndIndex + 1] : "";
        if (nextChar === "" || /\s/.test(nextChar)) {
          break;
        }
      }
      pathEndIndex++;
    }
    const rawAtPath = query.substring(atIndex, pathEndIndex);
    const atPath = unescapeAtPath(rawAtPath);
    parts.push({ type: "atPath", content: atPath });
    currentIndex = pathEndIndex;
  }

  return parts.filter((part) => !(part.type === "text" && part.content.trim() === ""));
}

/**
 * Extract all @ file paths from a query string
 * 从查询字符串中提取所有 @ 文件路径
 */
export function extractAtPaths(query: string): string[] {
  const parts = parseAllAtCommands(query);
  return parts
    .filter((part) => part.type === "atPath" && part.content !== "")
    .map((part) => part.content);
}

/**
 * Check if a query contains any @ file references
 * 检查查询是否包含任何 @ 文件引用
 */
export function hasAtReferences(query: string): boolean {
  return extractAtPaths(query).length > 0;
}

/**
 * Reconstruct query from parts, optionally replacing @ paths
 * 从部分重建查询，可选择替换 @ 路径
 */
export function reconstructQuery(
  parts: AtCommandPart[],
  pathReplacer?: (path: string) => string
): string {
  return parts
    .map((part) => {
      if (part.type === "text") {
        return part.content;
      } else {
        if (pathReplacer) {
          return pathReplacer(part.content);
        }
        return "@" + part.content;
      }
    })
    .join("");
}
