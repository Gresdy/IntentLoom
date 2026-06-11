/**
 * fileMarker — AionUi `parseFileMarker` / `resolveMessageFilePath` /
 * `appendFileMarker` port tests.
 */

import { describe, expect, it } from "vitest";
import {
  AIONUI_FILES_MARKER,
  appendFileMarker,
  isAbsoluteMessageFilePath,
  parseFileMarker,
  resolveMessageFilePath,
} from "@/chat/fileMarker";

describe("AIONUI_FILES_MARKER", () => {
  it("uses the exact AionUi literal so CLI-side parity holds", () => {
    expect(AIONUI_FILES_MARKER).toBe("<aionui_files>");
  });
});

describe("parseFileMarker", () => {
  it("splits at the marker and returns the path list", () => {
    const text = `Look at this screenshot

${AIONUI_FILES_MARKER}
/abs/path/a.png
/abs/path/b.pdf`;
    const out = parseFileMarker(text);
    expect(out.text).toBe("Look at this screenshot");
    expect(out.files).toEqual(["/abs/path/a.png", "/abs/path/b.pdf"]);
  });

  it("returns the original text and an empty list when the marker is absent", () => {
    const out = parseFileMarker("plain text without marker");
    expect(out.text).toBe("plain text without marker");
    expect(out.files).toEqual([]);
  });

  it("skips empty / whitespace-only lines after the marker", () => {
    const text = `before

${AIONUI_FILES_MARKER}

/a.png


/b.pdf
`;
    const out = parseFileMarker(text);
    expect(out.files).toEqual(["/a.png", "/b.pdf"]);
  });

  it("handles non-string input gracefully", () => {
    expect(parseFileMarker("").text).toBe("");
    expect(parseFileMarker(null as unknown as string).text).toBe("");
  });
});

describe("isAbsoluteMessageFilePath", () => {
  it("recognises POSIX absolute paths", () => {
    expect(isAbsoluteMessageFilePath("/abs/path")).toBe(true);
  });
  it("recognises Windows absolute paths", () => {
    expect(isAbsoluteMessageFilePath("C:\\path")).toBe(true);
    expect(isAbsoluteMessageFilePath("C:/path")).toBe(true);
    expect(isAbsoluteMessageFilePath("\\\\server\\share")).toBe(true);
  });
  it("rejects relative paths", () => {
    expect(isAbsoluteMessageFilePath("relative/path")).toBe(false);
    expect(isAbsoluteMessageFilePath("./here")).toBe(false);
    expect(isAbsoluteMessageFilePath("")).toBe(false);
  });
});

describe("resolveMessageFilePath", () => {
  it("passes absolute paths through unchanged", () => {
    expect(resolveMessageFilePath("/abs/path", "/workspace")).toBe("/abs/path");
  });
  it("joins relative paths to the workspace", () => {
    expect(resolveMessageFilePath("src/foo.ts", "/workspace")).toBe(
      "/workspace/src/foo.ts",
    );
  });
  it("strips a leading ./ from the relative path", () => {
    expect(resolveMessageFilePath("./src/foo.ts", "/workspace")).toBe(
      "/workspace/src/foo.ts",
    );
  });
  it("falls back to the relative path when workspace is missing", () => {
    expect(resolveMessageFilePath("./foo.ts")).toBe("./foo.ts");
  });
  it("normalises back-slashes to forward-slashes", () => {
    expect(resolveMessageFilePath("src\\foo.ts", "C:\\workspace")).toBe(
      "C:/workspace/src/foo.ts",
    );
  });
});

describe("appendFileMarker", () => {
  it("returns the text unchanged when paths is empty", () => {
    expect(appendFileMarker("hello", [])).toBe("hello");
  });
  it("builds the marker wire format with one path per line", () => {
    const out = appendFileMarker("hi", ["/a.png", "/b.pdf"]);
    expect(out).toBe(`hi\n\n${AIONUI_FILES_MARKER}\n/a.png\n/b.pdf`);
  });
  it("filters out empty / non-string entries", () => {
    const out = appendFileMarker("hi", ["/a.png", "", null as unknown as string, "/b.pdf"]);
    expect(out).toBe(`hi\n\n${AIONUI_FILES_MARKER}\n/a.png\n/b.pdf`);
  });

  it("round-trips through parseFileMarker", () => {
    const original = "user said hi";
    const paths = ["/abs/a.png", "/abs/b.pdf"];
    const built = appendFileMarker(original, paths);
    const { text, files } = parseFileMarker(built);
    expect(text).toBe(original);
    expect(files).toEqual(paths);
  });
});
