import { fireEvent, render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SelectionReplyButton, SELECTION_REPLY_EVENT } from "@/components/Chat/SelectionReplyButton";

const triggerSelection = (text: string) => {
  const sel = window.getSelection();
  // jsdom doesn't render the selection on a real DOM range, so we
  // build a span in a real row, select its text, and fire the event
  // that the component listens to.
  const host = document.createElement("div");
  host.dataset.messageId = "msg-1";
  host.dataset.agentId = "claude";
  const span = document.createElement("span");
  span.textContent = text;
  host.appendChild(span);
  document.body.appendChild(host);
  const range = document.createRange();
  range.selectNodeContents(span);
  sel?.removeAllRanges();
  sel?.addRange(range);
  // jsdom doesn't implement getBoundingClientRect on Range, so we
  // monkey-patch it onto the prototype for the duration of the test.
  // (The component calls `range.getBoundingClientRect()`.)
  if (!Range.prototype.getBoundingClientRect) {
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      value: () => ({ top: 100, left: 100, right: 200, bottom: 120, width: 100, height: 20, x: 100, y: 100, toJSON() { return {}; } }),
      configurable: true,
      writable: true,
    });
  }
  // jsdom fires selectionchange only when the selection is actually
  // applied; fire it manually so the component's listener runs.
  document.dispatchEvent(new Event("selectionchange"));
  return { host, sel, range };
};

describe("SelectionReplyButton", () => {
  beforeEach(() => {
    // Reset selection before each test.
    window.getSelection()?.removeAllRanges();
    // Start from a clean DOM.
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("does not render the button when nothing is selected", () => {
    render(<SelectionReplyButton />);
    expect(screen.queryByTestId("selection-reply-button")).toBeNull();
  });

  it("renders the button when text is selected inside a transcript row", () => {
    render(<SelectionReplyButton />);
    act(() => {
      triggerSelection("hello world");
    });
    const btn = screen.getByTestId("selection-reply-button");
    expect(btn).toBeTruthy();
  });

  it("dispatches a SELECTION_REPLY_EVENT on click", () => {
    const handler = vi.fn();
    window.addEventListener(SELECTION_REPLY_EVENT, handler as EventListener);
    render(<SelectionReplyButton />);
    act(() => {
      triggerSelection("this is selected text");
    });
    fireEvent.click(screen.getByTestId("selection-reply-button"));
    expect(handler).toHaveBeenCalledTimes(1);
    const evt = handler.mock.calls[0][0] as CustomEvent;
    expect(evt.detail.text).toBe("this is selected text");
    expect(evt.detail.messageId).toBe("msg-1");
    expect(evt.detail.agentId).toBe("claude");
    window.removeEventListener(SELECTION_REPLY_EVENT, handler as EventListener);
  });

  it("hides the button when the selection is shorter than 3 chars", () => {
    render(<SelectionReplyButton />);
    act(() => {
      triggerSelection("ab");
    });
    expect(screen.queryByTestId("selection-reply-button")).toBeNull();
  });
});
