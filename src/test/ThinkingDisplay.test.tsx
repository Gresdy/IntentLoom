/**
 * Component-level tests for `ThinkingDisplay`. The component
 * is purely presentational; the live state machine is
 * covered by `thinkingReducer.test.ts` and the helper
 * functions (`formatDurationMs`, `firstLine`) are exported
 * so they can be unit-tested directly without a render.
 *
 * The render tests assert on the AionUi-style card
 * affordances: the subject tag, the live timer on the
 * active path, the pinned duration on the done path, the
 * auto-collapse behaviour, and the gradient background.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ThinkingDisplay,
  formatDurationMs,
  firstLine,
} from "@/components/Chat/ThinkingDisplay";
import { useThemeStore } from "@/stores/useThemeStore";

describe("formatDurationMs", () => {
  it("renders sub-minute durations as plain seconds", () => {
    expect(formatDurationMs(0)).toBe("0s");
    expect(formatDurationMs(1_000)).toBe("1s");
    expect(formatDurationMs(12_345)).toBe("12s");
    expect(formatDurationMs(59_999)).toBe("59s");
  });

  it("renders minute+ durations as 'Xm Ys'", () => {
    expect(formatDurationMs(60_000)).toBe("1m 0s");
    expect(formatDurationMs(75_000)).toBe("1m 15s");
    expect(formatDurationMs(125_000)).toBe("2m 5s");
  });

  it("clamps negative input to 0s", () => {
    expect(formatDurationMs(-1)).toBe("0s");
    expect(formatDurationMs(-100_000)).toBe("0s");
  });
});

describe("firstLine", () => {
  it("returns the first non-empty line, trimmed", () => {
    expect(firstLine("hello world")).toBe("hello world");
    expect(firstLine("  first  \n  second")).toBe("first");
  });

  it("truncates a long first line with an ellipsis", () => {
    const long = "a".repeat(200);
    const out = firstLine(long, 80);
    expect(out).toBe("a".repeat(80) + "…");
  });

  it("returns an empty string for empty / whitespace input", () => {
    expect(firstLine("")).toBe("");
    expect(firstLine("   \n   ")).toBe("");
  });
});

interface MountHandle {
  getContainer: () => HTMLElement;
  unmount: () => void;
}

function mount(props: React.ComponentProps<typeof ThinkingDisplay>): MountHandle {
  const host = document.createElement("div");
  document.body.appendChild(host);
  let root: Root;
  act(() => {
    root = createRoot(host);
    root.render(createElement(ThinkingDisplay, props));
  });
  return {
    getContainer: () => host,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      document.body.removeChild(host);
    },
  };
}

describe("ThinkingDisplay (component)", () => {
  beforeEach(() => {
    useThemeStore.setState({ mode: "light" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when content is empty and not active", () => {
    const h = mount({
      content: "",
      status: "done",
      startTime: 100,
      duration: 0,
    });
    expect(h.getContainer().querySelector("[data-testid=\"thinking-display\"]")).toBeNull();
    h.unmount();
  });

  it("renders the active subject and the live elapsed time while reasoning", () => {
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start + 4_000);
    const h = mount({
      content: "let me think about that",
      status: "active",
      startTime: start,
    });
    const node = h.getContainer().querySelector("[data-testid=\"thinking-display\"]");
    expect(node).not.toBeNull();
    expect(node?.classList.contains("thinking--active")).toBe(true);
    // 4s elapsed: the active timer renders as "4s"
    expect(node?.textContent).toContain("思考中");
    expect(node?.textContent).toContain("4s");
    h.unmount();
  });

  it("renders the done subject + the pinned duration on completion", () => {
    const h = mount({
      content: "I considered the tradeoffs and chose X.\nMore reasoning.",
      status: "done",
      startTime: 100,
      duration: 12_345,
    });
    const node = h.getContainer().querySelector("[data-testid=\"thinking-display\"]");
    expect(node).not.toBeNull();
    expect(node?.classList.contains("thinking--done")).toBe(true);
    expect(node?.textContent).toContain("思考完成");
    expect(node?.textContent).toContain("12s");
    // First-line preview should appear in the header.
    expect(node?.textContent).toContain("I considered the tradeoffs and chose X.");
    h.unmount();
  });

  it("auto-collapses the body on completion (header-only render by default)", () => {
    const h = mount({
      content: "deep reasoning that the user should not have to see by default",
      status: "done",
      startTime: 100,
      duration: 5_000,
    });
    const body = h.getContainer().querySelector(".thinking__body");
    expect(body).toBeNull();
    h.unmount();
  });

  it("expands the body when the header is clicked", () => {
    const h = mount({
      content: "deep reasoning that the user wants to see",
      // Use 'done' so the body starts collapsed (auto-
      // collapse on completion). Clicking the header then
      // expands it; with 'active' the body would already
      // be on screen and the click would COLLAPSE it.
      status: "done",
      startTime: 100,
      duration: 5_000,
    });
    const header = h.getContainer().querySelector(
      "button.thinking__header",
    ) as HTMLButtonElement | null;
    expect(header).not.toBeNull();
    act(() => {
      header?.click();
    });
    const body = h.getContainer().querySelector(".thinking__body");
    expect(body).not.toBeNull();
    expect(body?.textContent).toContain("deep reasoning");
    h.unmount();
  });

  it("uses a dark gradient when the theme is dark", () => {
    useThemeStore.setState({ mode: "dark" });
    const h = mount({
      content: "thinking",
      status: "active",
      startTime: Date.now(),
    });
    const node = h.getContainer().querySelector("[data-testid=\"thinking-display\"]") as HTMLElement | null;
    expect(node).not.toBeNull();
    const bg = (node?.getAttribute("style") ?? "").toLowerCase();
    expect(bg).toContain("linear-gradient");
    // Dark variant uses a slate/charcoal stop, NOT the
    // light-mode F0F3FF stop.
    expect(bg).not.toContain("#f0f3ff");
    h.unmount();
  });

  it("uses a light gradient when the theme is light", () => {
    useThemeStore.setState({ mode: "light" });
    const h = mount({
      content: "thinking",
      status: "active",
      startTime: Date.now(),
    });
    const node = h.getContainer().querySelector("[data-testid=\"thinking-display\"]") as HTMLElement | null;
    expect(node).not.toBeNull();
    const bg = (node?.getAttribute("style") ?? "").toLowerCase();
    expect(bg).toContain("linear-gradient");
    expect(bg).toContain("#f0f3ff");
    h.unmount();
  });
});
