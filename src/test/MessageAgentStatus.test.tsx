import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageAgentStatus } from "@/components/Chat/MessageAgentStatus";

describe("MessageAgentStatus", () => {
  it("renders the connecting state with the agent name and backend", () => {
    render(<MessageAgentStatus id="a1" backend="claude" status="connecting" agentName="Claude Code" />);
    expect(screen.getByTestId("agent-status-connecting")).toBeTruthy();
    expect(screen.getByText("Claude Code")).toBeTruthy();
    expect(screen.getByText("正在连接…")).toBeTruthy();
  });

  it("falls back to the capitalised backend when no agent name is given", () => {
    render(<MessageAgentStatus id="a1" backend="openclaw" status="connected" />);
    expect(screen.getByText("OpenClaw")).toBeTruthy();
    expect(screen.getByText("已连接")).toBeTruthy();
  });

  it("renders the error state in red", () => {
    render(<MessageAgentStatus id="a1" backend="gemini" status="error" />);
    expect(screen.getByTestId("agent-status-error")).toBeTruthy();
    expect(screen.getByText("连接出错")).toBeTruthy();
  });

  it("renders the session_active state for completed sessions", () => {
    render(<MessageAgentStatus id="a1" backend="codex" status="session_active" />);
    expect(screen.getByTestId("agent-status-session_active")).toBeTruthy();
    expect(screen.getByText("会话已激活")).toBeTruthy();
  });

  it("hides the disconnected state", () => {
    const { container } = render(
      <MessageAgentStatus id="a1" backend="claude" status={"disconnected" as any} />
    );
    expect(container.firstChild).toBeNull();
  });
});
