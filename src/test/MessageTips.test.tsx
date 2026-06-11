import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageTips } from "@/components/Chat/MessageTips";

describe("MessageTips", () => {
  it("renders an info notice inline (no card chrome)", () => {
    render(<MessageTips id="t1" level="info" text="正在为你加载…" />);
    const el = screen.getByTestId("message-tips-info");
    expect(el.textContent).toContain("正在为你加载…");
  });

  it("auto-highlights a JSON body as a code block", () => {
    const json = '{"a": 1, "b": [1, 2, 3]}';
    render(<MessageTips id="t1" level="warning" text={json} />);
    const el = screen.getByTestId("message-tips-warning");
    expect(el.querySelector("pre")?.textContent).toContain('"a": 1');
  });

  it("renders structured errors with ownership + retryable + resolution tags", () => {
    render(
      <MessageTips
        id="t1"
        level="error"
        text="ignored"
        structuredError={{
          message: "Provider key invalid",
          code: "INVALID_KEY",
          ownership: "user_llm_provider",
          retryable: false,
          resolution: "check_provider_credentials",
        }}
      />
    );
    const el = screen.getByTestId("message-tips-error");
    expect(el.textContent).toContain("Provider key invalid");
    expect(el.textContent).toContain("模型提供方错误");
    expect(el.textContent).toContain("不可重试");
    expect(el.textContent).toContain("检查 Provider 凭据");
  });

  it("expands the tech details on click", () => {
    render(
      <MessageTips
        id="t1"
        level="error"
        text="raw technical payload"
        structuredError={{ message: "Boom", code: "BOOM", detail: "stack trace here" }}
      />
    );
    const btn = screen.getByRole("button", { name: /技术细节/ });
    fireEvent.click(btn);
    expect(screen.getByText(/stack trace here/)).toBeTruthy();
  });

  it("does not parse non-JSON long text as JSON", () => {
    render(<MessageTips id="t1" level="warning" text={"not json ".repeat(40)} />);
    const el = screen.getByTestId("message-tips-warning");
    // No <pre> for a body that isn't JSON.
    expect(el.querySelector("pre.message-tips__json")).toBeNull();
  });
});
