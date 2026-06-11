/**
 * MessageAvailableCommands — AionUi `MessageAvailableCommands` port tests.
 *
 * Covers:
 *  - default-collapsed rendering (the command list is hidden until
 *    the user clicks the header)
 *  - click toggles the list open / closed
 *  - the rendered list shows each command's name, description, and
 *    optional hint
 *  - an empty commands array returns null (no card)
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageAvailableCommands } from "@/components/Chat/MessageAvailableCommands";

const SAMPLE = [
  { name: "init", description: "为当前目录生成 CLAUDE.md / AGENTS.md" },
  { name: "compact", description: "压缩历史上下文", hint: "[n]" },
  { name: "model", description: "切换默认模型" },
];

describe("MessageAvailableCommands", () => {
  it("renders a header with the count and no list by default", () => {
    render(<MessageAvailableCommands id="c1" commands={SAMPLE} />);
    expect(screen.getByTestId("message-available-commands")).toBeTruthy();
    expect(screen.getByText("可用命令（3）")).toBeTruthy();
    // List is collapsed by default — queryByTestId returns null
    // when the element is not in the document.
    expect(screen.queryByTestId("message-available-commands-list")).toBeNull();
  });

  it("clicking the header reveals the full command list", () => {
    render(<MessageAvailableCommands id="c1" commands={SAMPLE} />);
    fireEvent.click(screen.getByTestId("message-available-commands-toggle"));
    const items = screen.getAllByTestId("message-available-commands-item");
    expect(items).toHaveLength(3);
    expect(screen.getByText("/init")).toBeTruthy();
    expect(screen.getByText("/compact")).toBeTruthy();
    expect(screen.getByText("/model")).toBeTruthy();
    // Description and hint are rendered together.
    expect(screen.getByText(/压缩历史上下文/)).toBeTruthy();
    expect(screen.getByText(/\[n\]/)).toBeTruthy();
  });

  it("clicking the header a second time collapses the list again", () => {
    render(<MessageAvailableCommands id="c1" commands={SAMPLE} />);
    const header = screen.getByTestId("message-available-commands-toggle");
    fireEvent.click(header);
    expect(screen.getByTestId("message-available-commands-list")).toBeTruthy();
    fireEvent.click(header);
    expect(screen.queryByTestId("message-available-commands-list")).toBeNull();
  });

  it("renders nothing when commands is empty", () => {
    const { container } = render(
      <MessageAvailableCommands id="c1" commands={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("stamps data-message-id and data-agent-id on the host", () => {
    render(
      <MessageAvailableCommands id="c1" commands={SAMPLE} agentId="claude" />,
    );
    const host = screen.getByTestId("message-available-commands");
    expect(host.getAttribute("data-message-id")).toBe("c1");
    expect(host.getAttribute("data-agent-id")).toBe("claude");
  });
});
