import { describe, expect, it } from "vitest";
import {
  getErrorMessage,
  isSafeAbsolutePath,
  isSafeRelativePath,
  isValidIdePath,
  normalizeSkillName,
  parseManualSkillSource,
} from "@/stores/skillUtils";

describe("isSafeRelativePath", () => {
  it.each([
    [".claude/skills", true],
    ["nested/path/file.md", true],
    ["single", true],
    ["", false],
    ["/abs", false],
    ["C:\\\\Users", false],
    ["\\\\unc", false],
    ["./../etc", false],
    ["CON.md", false],
    ["passwd\u0000.txt", false],
  ])("isSafeRelativePath(%j) -> %s", (input, expected) => {
    expect(isSafeRelativePath(input)).toBe(expected);
  });
});

describe("isSafeAbsolutePath", () => {
  it.each([
    ["/home/user/project", true],
    ["/etc/passwd", false],
    ["/proc/cpuinfo", false],
    ["C:\\\\Users\\\\foo", true],
    ["D:\\\\code", true],
    [String.raw`\\wsl$\\Ubuntu\home`, true],
    [String.raw`\\wsl.localhost\\Ubuntu\home`, true],
    ["relative/path", false],
    ["", false],
  ])("isSafeAbsolutePath(%j) -> %s", (input, expected) => {
    expect(isSafeAbsolutePath(input)).toBe(expected);
  });
});

describe("isValidIdePath", () => {
  it("accepts both relative and absolute paths", () => {
    expect(isValidIdePath(".claude/skills")).toBe(true);
    expect(isValidIdePath("/home/user/code")).toBe(true);
    expect(isValidIdePath("../escape")).toBe(false);
  });
});

describe("getErrorMessage", () => {
  it("returns the message from an Error instance", () => {
    expect(getErrorMessage(new Error("boom"), "fallback")).toBe("boom");
  });
  it("returns the string for a plain string", () => {
    expect(getErrorMessage("oops", "fallback")).toBe("oops");
  });
  it("returns the fallback for null / undefined", () => {
    expect(getErrorMessage(null, "fallback")).toBe("fallback");
    expect(getErrorMessage(undefined, "fallback")).toBe("fallback");
  });
  it("handles object-style errors with a message field", () => {
    expect(getErrorMessage({ message: "weird" }, "fallback")).toBe("weird");
  });
});

describe("normalizeSkillName", () => {
  it.each([
    ["My Skill.git", "my-skill"],
    ["cool.zip", "cool"],
    ["  Hello World!  ", "hello-world"],
    ["emoji 🚀 rocket", "emoji-rocket"],
  ])("normalizeSkillName(%j) -> %j", (input, expected) => {
    expect(normalizeSkillName(input)).toBe(expected);
  });
});

describe("parseManualSkillSource", () => {
  it("parses a GitHub repo URL", () => {
    const r = parseManualSkillSource("https://github.com/foo/bar");
    expect(r?.kind).toBe("github_repo");
    expect(r?.inferredName).toBe("bar");
  });
  it("parses a GitHub tree URL into subpath name", () => {
    const r = parseManualSkillSource("https://github.com/foo/bar/tree/main/skills/baz");
    expect(r?.kind).toBe("github_tree");
    expect(r?.inferredName).toBe("baz");
  });
  it("rejects blob URLs", () => {
    expect(parseManualSkillSource("https://github.com/foo/bar/blob/main/x.md")).toBeNull();
  });
  it("parses a zip URL with the file name", () => {
    const r = parseManualSkillSource("https://example.com/skills/cool.zip");
    expect(r?.kind).toBe("zip");
    expect(r?.inferredName).toBe("cool");
  });
  it("rejects non-http protocols", () => {
    expect(parseManualSkillSource("ftp://example.com/x.zip")).toBeNull();
  });
});
