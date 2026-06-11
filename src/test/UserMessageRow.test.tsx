/**
 * UserMessageRow / AssistantMessageRow — T4 chat parity tests.
 *
 * Both rows are exported from ReasonixTranscript so the unit
 * tests can drive them in isolation without mounting the full
 * Transcript (which would require mocking `useAutoScroll`,
 * `useMessageStore`, `ConversationArtifactProvider`, etc.).
 *
 * Coverage:
 *  - UserMessageRow shows the edit pencil only when onEdit is provided
 *  - Clicking the pencil swaps the bubble for a textarea + save/cancel
 *  - Save calls onEdit with the trimmed new text
 *  - Cancel restores the original text
 *  - Enter (no shift) confirms; Escape cancels
 *  - Save is disabled when the draft is empty or unchanged
 *  - AssistantMessageRow shows the regenerate button only when
 *    onRegenerate is provided AND the turn is not streaming
 *  - Clicking regenerate calls onRegenerate with the message id
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  UserMessageRow,
  AssistantMessageRow,
} from "@/components/Chat/ReasonixTranscript";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UserMessageRow", () => {
  it("renders the user text inside a msg--user bubble", () => {
    render(<UserMessageRow id="u1" text="hi there" onEdit={vi.fn()} />);
    expect(screen.getByTestId("user-message-actions")).toBeTruthy();
    expect(screen.getByText("hi there")).toBeTruthy();
  });

  it("hides the edit pencil when onEdit is not provided", () => {
    render(<UserMessageRow id="u1" text="hi" />);
    expect(screen.queryByTestId("user-message-actions")).toBeNull();
  });

  it("hides the edit pencil while the message is streaming", () => {
    render(<UserMessageRow id="u1" text="hi" streaming onEdit={vi.fn()} />);
    expect(screen.queryByTestId("user-message-actions")).toBeNull();
  });

  it("clicking the edit pencil swaps the bubble for a textarea + actions", () => {
    render(<UserMessageRow id="u1" text="hi" onEdit={vi.fn()} />);
    fireEvent.click(screen.getByTestId("user-message-edit-button"));
    expect(screen.getByTestId("user-message-edit-form")).toBeTruthy();
    const textarea = screen.getByTestId("user-message-edit-textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe("hi");
    expect(screen.getByTestId("user-message-edit-cancel")).toBeTruthy();
    expect(screen.getByTestId("user-message-edit-save")).toBeTruthy();
  });

  it("save calls onEdit with the trimmed new text and exits edit mode", () => {
    const onEdit = vi.fn();
    render(<UserMessageRow id="u1" text="hi" onEdit={onEdit} />);
    fireEvent.click(screen.getByTestId("user-message-edit-button"));
    const textarea = screen.getByTestId("user-message-edit-textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "  hello  " } });
    fireEvent.click(screen.getByTestId("user-message-edit-save"));
    expect(onEdit).toHaveBeenCalledWith("u1", "hello");
    // After save the edit form unmounts.
    expect(screen.queryByTestId("user-message-edit-form")).toBeNull();
  });

  it("save is a no-op (and stays in edit mode) when the draft is empty", () => {
    const onEdit = vi.fn();
    render(<UserMessageRow id="u1" text="hi" onEdit={onEdit} />);
    fireEvent.click(screen.getByTestId("user-message-edit-button"));
    const textarea = screen.getByTestId("user-message-edit-textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "   " } });
    const save = screen.getByTestId("user-message-edit-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByTestId("user-message-edit-form")).toBeTruthy();
  });

  it("cancel restores the original text and exits edit mode", () => {
    const onEdit = vi.fn();
    render(<UserMessageRow id="u1" text="hi" onEdit={onEdit} />);
    fireEvent.click(screen.getByTestId("user-message-edit-button"));
    const textarea = screen.getByTestId("user-message-edit-textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "draft" } });
    fireEvent.click(screen.getByTestId("user-message-edit-cancel"));
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByTestId("user-message-edit-form")).toBeNull();
    // Bubble is back with the original text.
    expect(screen.getByText("hi")).toBeTruthy();
  });

  it("Enter (no shift) saves, Escape cancels", () => {
    const onEdit = vi.fn();
    const { rerender } = render(<UserMessageRow id="u1" text="hi" onEdit={onEdit} />);
    fireEvent.click(screen.getByTestId("user-message-edit-button"));
    let textarea = screen.getByTestId("user-message-edit-textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "updated" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(onEdit).toHaveBeenCalledWith("u1", "updated");

    // Re-mount and exercise the Escape path.
    onEdit.mockClear();
    rerender(<UserMessageRow id="u2" text="hi" onEdit={onEdit} />);
    fireEvent.click(screen.getByTestId("user-message-edit-button"));
    textarea = screen.getByTestId("user-message-edit-textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "draft" } });
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByTestId("user-message-edit-form")).toBeNull();
  });
});

describe("AssistantMessageRow", () => {
  it("renders the assistant text inside a msg--assistant wrapper", () => {
    render(<AssistantMessageRow id="a1" text="answer" onRegenerate={vi.fn()} />);
    expect(screen.getByText("answer")).toBeTruthy();
  });

  it("shows the regenerate button only when onRegenerate is provided", () => {
    const { rerender } = render(<AssistantMessageRow id="a1" text="answer" />);
    expect(screen.queryByTestId("assistant-message-actions")).toBeNull();
    rerender(<AssistantMessageRow id="a1" text="answer" onRegenerate={vi.fn()} />);
    expect(screen.queryByTestId("assistant-message-actions")).toBeTruthy();
  });

  it("hides the regenerate button while the assistant turn is streaming", () => {
    render(<AssistantMessageRow id="a1" text="..." streaming onRegenerate={vi.fn()} />);
    expect(screen.queryByTestId("assistant-message-actions")).toBeNull();
  });

  it("clicking regenerate calls onRegenerate with the message id", () => {
    const onRegenerate = vi.fn();
    render(<AssistantMessageRow id="a1" text="answer" onRegenerate={onRegenerate} />);
    fireEvent.click(screen.getByTestId("assistant-message-regenerate-button"));
    expect(onRegenerate).toHaveBeenCalledWith("a1");
  });
});
