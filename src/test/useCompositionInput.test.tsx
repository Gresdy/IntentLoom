/**
 * useCompositionInput — T6 chat parity tests.
 *
 * The hook is the IME gate the composer uses to drop Enter while
 * the user is composing with a Chinese / Japanese / Korean IME.
 * Tests cover the three independent signals the gate consults:
 *   (a) React `isComposing` state (compositionstart..end window)
 *   (b) `event.nativeEvent.isComposing` (browser-side hint)
 *   (c) 200 ms safety latch after compositionend (catches the
 *       commit-Enter some IMEs fire on the same tick)
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { useCompositionInput } from "@/hooks/useCompositionInput";

type HarnessProps = {
  onKey: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
};

function Harness({ onKey }: HarnessProps) {
  const { isComposing, onCompositionStart, onCompositionEnd, guardKeyDown } = useCompositionInput();
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div>
      <span data-testid="isComposing">{String(isComposing)}</span>
      <textarea
        ref={ref}
        data-testid="ta"
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        onKeyDown={guardKeyDown(onKey)}
      />
    </div>
  );
}

describe("useCompositionInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with isComposing=false", () => {
    render(<Harness onKey={vi.fn()} />);
    expect(screen.getByTestId("isComposing").textContent).toBe("false");
  });

  it("Enter is forwarded to the caller's handler when not composing", () => {
    const onKey = vi.fn();
    render(<Harness onKey={onKey} />);
    const ta = screen.getByTestId("ta");
    fireEvent.keyDown(ta, { key: "Enter", code: "Enter" });
    expect(onKey).toHaveBeenCalledTimes(1);
  });

  it("Enter is dropped while composition is active (compositionstart..end window)", () => {
    const onKey = vi.fn();
    render(<Harness onKey={onKey} />);
    const ta = screen.getByTestId("ta");
    fireEvent.compositionStart(ta);
    expect(screen.getByTestId("isComposing").textContent).toBe("true");
    fireEvent.keyDown(ta, { key: "Enter", code: "Enter" });
    expect(onKey).not.toHaveBeenCalled();
    fireEvent.compositionEnd(ta);
    expect(screen.getByTestId("isComposing").textContent).toBe("false");
  });

  it("200 ms safety latch catches the commit-Enter that follows compositionend", () => {
    const onKey = vi.fn();
    render(<Harness onKey={onKey} />);
    const ta = screen.getByTestId("ta");
    fireEvent.compositionStart(ta);
    fireEvent.compositionEnd(ta);
    // The isComposing state is already false, but the latch is armed
    // for 200 ms. An Enter that arrives inside the window must also
    // be dropped.
    fireEvent.keyDown(ta, { key: "Enter", code: "Enter" });
    expect(onKey).not.toHaveBeenCalled();
    // After the latch expires, Enter goes through again.
    act(() => {
      vi.advanceTimersByTime(250);
    });
    fireEvent.keyDown(ta, { key: "Enter", code: "Enter" });
    expect(onKey).toHaveBeenCalledTimes(1);
  });

  it("native event.isComposing is also honored (catches IMEs that skip the React events)", () => {
    const onKey = vi.fn();
    render(<Harness onKey={onKey} />);
    const ta = screen.getByTestId("ta");
    fireEvent.keyDown(ta, {
      key: "Enter",
      code: "Enter",
      // jsdom's KeyboardEvent constructor accepts the init dict and
      // exposes isComposing on the underlying native event.
      isComposing: true,
    });
    expect(onKey).not.toHaveBeenCalled();
  });

  it("non-Enter keys always pass through (composition is Enter-only)", () => {
    const onKey = vi.fn();
    render(<Harness onKey={onKey} />);
    const ta = screen.getByTestId("ta");
    fireEvent.compositionStart(ta);
    fireEvent.keyDown(ta, { key: "a", code: "KeyA" });
    fireEvent.keyDown(ta, { key: "ArrowLeft", code: "ArrowLeft" });
    expect(onKey).toHaveBeenCalledTimes(2);
  });
});
