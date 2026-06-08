/**
 * Tests for the new `ThinkingDisplay` lifecycle in
 * `messageStore` — the three new actions that drive the
 * AionUi-style "thinking process" card:
 *
 *   - `beginThinking()` — stamp startTime, idempotent
 *   - `finishThinking()` — compute final duration
 *   - `resetCurrentStream()` — clear the card on every new
 *     turn so a stale "思考完成 (12s)" from a prior
 *     conversation cannot bleed into the next one.
 *
 * The contract under test mirrors the AionUi
 * `MessageThinking` message shape: a single `meta` object
 * (status / startTime / duration) that the
 * `ThinkingDisplay` component reads verbatim.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMessageStore } from "@/stores/messageStore";

describe("messageStore — ThinkingDisplay lifecycle", () => {
  beforeEach(() => {
    useMessageStore.setState({
      currentThinking: "",
      currentThinkingProcess: null,
      currentThinkingMeta: null,
    });
  });

  it("starts with currentThinkingMeta = null", () => {
    expect(useMessageStore.getState().currentThinkingMeta).toBeNull();
  });

  it("beginThinking stamps status: 'active' and a fresh startTime", () => {
    const before = Date.now();
    useMessageStore.getState().beginThinking();
    const after = Date.now();
    const meta = useMessageStore.getState().currentThinkingMeta;
    expect(meta).not.toBeNull();
    expect(meta?.status).toBe("active");
    expect(meta?.startTime).toBeGreaterThanOrEqual(before);
    expect(meta?.startTime).toBeLessThanOrEqual(after);
  });

  it("beginThinking is idempotent: a second call does NOT reset startTime", () => {
    useMessageStore.getState().beginThinking();
    const first = useMessageStore.getState().currentThinkingMeta!.startTime;
    // Advance the clock by 50ms so a naive reset would
    // produce a different startTime.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 50);
    useMessageStore.getState().beginThinking();
    vi.useRealTimers();
    const second = useMessageStore.getState().currentThinkingMeta!.startTime;
    expect(second).toBe(first);
  });

  it("finishThinking on an active card stamps duration = now - startTime", () => {
    vi.useFakeTimers();
    const start = Date.now();
    useMessageStore.setState({
      currentThinkingMeta: { status: "active", startTime: start },
    });
    vi.setSystemTime(start + 1234);
    useMessageStore.getState().finishThinking();
    vi.useRealTimers();
    const meta = useMessageStore.getState().currentThinkingMeta!;
    expect(meta.status).toBe("done");
    expect(meta.startTime).toBe(start);
    expect(meta.duration).toBe(1234);
  });

  it("finishThinking on a missing card is a no-op", () => {
    useMessageStore.getState().finishThinking();
    expect(useMessageStore.getState().currentThinkingMeta).toBeNull();
  });

  it("finishThinking on an already-done card does NOT recompute duration", () => {
    useMessageStore.setState({
      currentThinkingMeta: {
        status: "done",
        startTime: 100,
        duration: 5000,
      },
    });
    useMessageStore.getState().finishThinking();
    const meta = useMessageStore.getState().currentThinkingMeta!;
    expect(meta.status).toBe("done");
    expect(meta.duration).toBe(5000);
  });

  it("resetCurrentStream clears the card so a stale duration cannot bleed into the next turn", () => {
    useMessageStore.setState({
      currentThinkingMeta: {
        status: "done",
        startTime: 100,
        duration: 5000,
      },
    });
    useMessageStore.getState().resetCurrentStream();
    expect(useMessageStore.getState().currentThinkingMeta).toBeNull();
  });

  it("beginThinking after a finish opens a fresh card (startTime advances)", () => {
    vi.useFakeTimers();
    useMessageStore.setState({
      currentThinkingMeta: { status: "done", startTime: 100, duration: 5000 },
    });
    vi.setSystemTime(Date.now() + 1000);
    useMessageStore.getState().beginThinking();
    vi.useRealTimers();
    const meta = useMessageStore.getState().currentThinkingMeta!;
    expect(meta.status).toBe("active");
    // The new startTime is from `Date.now()` at the moment
    // of `beginThinking`, NOT the old startTime of 100.
    expect(meta.startTime).toBeGreaterThan(100);
  });
});
