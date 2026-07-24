import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ToolExecutionDisplay } from "@/components/Chat/ToolExecutionDisplay";
import { useThemeStore } from "@/stores/useThemeStore";
import type { ToolCall } from "@/types/message";

const completedTools: ToolCall[] = [
  {
    id: "read-first",
    name: "Read",
    kind: "read",
    arguments: { path: "src/first.ts" },
    status: "completed",
    result: "first result",
  },
  {
    id: "run-second",
    name: "Bash",
    kind: "execute",
    arguments: { command: "npm test" },
    status: "completed",
    result: 0,
  },
];

describe("ToolExecutionDisplay", () => {
  beforeEach(() => {
    useThemeStore.setState({ mode: "dark" });
  });

  it("starts collapsed after completion and expands into execution order", () => {
    const { container } = render(
      <ToolExecutionDisplay tools={completedTools} startTime={1_700_000_000_000} />,
    );

    const display = screen.getByTestId("tool-execution-display");
    const header = within(display).getByRole("button", { name: /工具调用完成/ });
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(".tool-execution__body")).toBeNull();

    fireEvent.click(header);
    const rows = Array.from(container.querySelectorAll("[data-tool-id]"));
    expect(rows.map((row) => row.getAttribute("data-tool-id"))).toEqual([
      "read-first",
      "run-second",
    ]);
  });

  it("shows each call's input and result in a nested collapsible detail", () => {
    const { container } = render(
      <ToolExecutionDisplay tools={completedTools} startTime={1_700_000_000_000} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /工具调用完成/ }));
    const firstRow = container.querySelector('[data-tool-id="read-first"]');
    const secondRow = container.querySelector('[data-tool-id="run-second"]');
    expect(firstRow).not.toBeNull();
    expect(secondRow).not.toBeNull();

    fireEvent.click(within(firstRow as HTMLElement).getByRole("button"));
    expect(screen.getByTestId("tool-input-read-first").textContent).toContain("src/first.ts");
    expect(screen.getByTestId("tool-output-read-first").textContent).toBe("first result");

    fireEvent.click(within(secondRow as HTMLElement).getByRole("button"));
    expect(screen.getByTestId("tool-input-run-second").textContent).toContain("npm test");
    expect(screen.getByTestId("tool-output-run-second").textContent).toBe("0");
  });

  it("stays expanded while a tool is running", () => {
    const running: ToolCall[] = [{ ...completedTools[0], status: "in_progress", result: undefined }];
    render(<ToolExecutionDisplay tools={running} startTime={Date.now()} />);

    const header = screen.getByRole("button", { name: /正在调用工具/ });
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("tool-execution-display").textContent).toContain("1 个步骤");
  });
});
