import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageSkillSuggest } from "@/components/Chat/MessageSkillSuggest";

describe("MessageSkillSuggest", () => {
  it("renders the skill name, description, and accept/dismiss buttons", () => {
    render(
      <MessageSkillSuggest
        id="s1"
        name="code-review"
        description="审查本次变更的代码"
      />
    );
    expect(screen.getByTestId("message-skill-suggest")).toBeTruthy();
    expect(screen.getByText("code-review")).toBeTruthy();
    expect(screen.getByText("审查本次变更的代码")).toBeTruthy();
    expect(screen.getByTestId("skill-suggest-accept")).toBeTruthy();
    expect(screen.getByTestId("skill-suggest-dismiss")).toBeTruthy();
  });

  it("calls onAccept and hides the card when '使用' is clicked", () => {
    const onAccept = vi.fn();
    render(
      <MessageSkillSuggest
        id="s1"
        name="code-review"
        description="d"
        onAccept={onAccept}
      />
    );
    fireEvent.click(screen.getByTestId("skill-suggest-accept"));
    expect(onAccept).toHaveBeenCalledWith("s1");
    // Card removed from the DOM after accept.
    expect(screen.queryByTestId("message-skill-suggest")).toBeNull();
  });

  it("calls onDismiss when '稍后' is clicked", () => {
    const onDismiss = vi.fn();
    render(
      <MessageSkillSuggest
        id="s1"
        name="x"
        description="d"
        onDismiss={onDismiss}
      />
    );
    fireEvent.click(screen.getByTestId("skill-suggest-dismiss"));
    expect(onDismiss).toHaveBeenCalledWith("s1");
  });

  it("toggles the content preview when '查看内容' is clicked", () => {
    render(
      <MessageSkillSuggest
        id="s1"
        name="x"
        description="d"
        content="# skill body\ndo the thing"
      />
    );
    const btn = screen.getByRole("button", { name: /查看内容/ });
    fireEvent.click(btn);
    expect(screen.getByText(/# skill body/)).toBeTruthy();
  });
});
