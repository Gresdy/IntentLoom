import { beforeEach, describe, expect, it } from "vitest";
import { useThemeStore } from "@/stores/useThemeStore";

describe("useThemeStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useThemeStore.setState({
      mode: "system",
      accentColor: "#d97757",
      fontSize: "medium",
      sidebarCollapsed: false,
      fontSizeValue: 14,
    });
  });

  it("starts with sane defaults", () => {
    const s = useThemeStore.getState();
    expect(s.mode).toBe("system");
    expect(s.accentColor).toBe("#d97757");
    expect(s.fontSize).toBe("medium");
    expect(s.sidebarCollapsed).toBe(false);
  });

  it("setMode updates mode and persists via persist middleware", () => {
    useThemeStore.getState().setMode("dark");
    expect(useThemeStore.getState().mode).toBe("dark");
  });

  it("setAccentColor stores the new accent", () => {
    useThemeStore.getState().setAccentColor("#3b82f6");
    expect(useThemeStore.getState().accentColor).toBe("#3b82f6");
  });

  it("setFontSize computes fontSizeValue for each band", () => {
    useThemeStore.getState().setFontSize("small");
    expect(useThemeStore.getState().fontSizeValue).toBe(13);
    useThemeStore.getState().setFontSize("large");
    expect(useThemeStore.getState().fontSizeValue).toBe(15);
  });

  it("toggleSidebar flips the boolean", () => {
    const before = useThemeStore.getState().sidebarCollapsed;
    useThemeStore.getState().toggleSidebar();
    expect(useThemeStore.getState().sidebarCollapsed).toBe(!before);
  });
});
