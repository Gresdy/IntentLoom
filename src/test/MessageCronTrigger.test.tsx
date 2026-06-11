import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageCronBadge, MessageCronTrigger } from "@/components/Chat/MessageCronTrigger";

describe("MessageCronTrigger", () => {
  it("renders a clickable row with the cron job name and time", () => {
    render(
      <MessageCronTrigger
        id="c1"
        cronJobId="job-7"
        cronJobName="morning-digest"
        triggeredAt={(() => { const d = new Date(); d.setHours(8, 30, 0, 0); return d.getTime(); })()}
      />
    );
    const el = screen.getByTestId("message-cron-trigger");
    expect(el.textContent).toContain("morning-digest");
    expect(el.textContent).toContain("08:30");  // local hour, set via setHours(8, 30)
    expect(el.dataset.cronJobId).toBe("job-7");
  });

  it("fires onNavigate when the row is clicked", () => {
    const onNavigate = vi.fn();
    render(
      <MessageCronTrigger
        id="c1"
        cronJobId="job-7"
        cronJobName="morning"
        onNavigate={onNavigate}
      />
    );
    fireEvent.click(screen.getByTestId("message-cron-trigger"));
    expect(onNavigate).toHaveBeenCalledWith("job-7");
  });

  it("supports keyboard activation with Enter", () => {
    const onNavigate = vi.fn();
    render(
      <MessageCronTrigger id="c1" cronJobId="job-7" onNavigate={onNavigate} />
    );
    const el = screen.getByTestId("message-cron-trigger");
    el.focus();
    fireEvent.keyDown(el, { key: "Enter" });
    expect(onNavigate).toHaveBeenCalledWith("job-7");
  });
});

describe("MessageCronBadge", () => {
  it("renders an inline badge with the job name", () => {
    render(<MessageCronBadge cronJobName="morning-digest" cronJobId="job-7" />);
    const el = screen.getByTestId("message-cron-badge");
    expect(el.textContent).toContain("morning-digest");
    expect(el.dataset.cronJobId).toBe("job-7");
  });
});
