import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessagePlan } from "@/components/Chat/MessagePlan";

const ENTRIES = [
  { id: "1", content: "Read the README", status: "completed" as const },
  { id: "2", content: "Refactor the loop", status: "in_progress" as const },
  { id: "3", content: "Add a unit test", status: "pending" as const },
  { id: "4", content: "Drop the legacy endpoint", status: "skipped" as const },
];

describe("MessagePlan", () => {
  it("renders the plan with progress count", () => {
    render(<MessagePlan id="p1" entries={ENTRIES} title="重构计划" />);
    const el = screen.getByTestId("message-plan");
    expect(el.dataset.planTotal).toBe("4");
    expect(el.dataset.planCompleted).toBe("1");
    expect(screen.getByText("重构计划")).toBeTruthy();
    expect(screen.getByText("1/4")).toBeTruthy();
  });

  it("renders all entries with their status markers", () => {
    render(<MessagePlan id="p1" entries={ENTRIES} />);
    expect(screen.getByText("Read the README")).toBeTruthy();
    expect(screen.getByText("Refactor the loop")).toBeTruthy();
    expect(screen.getByText("Add a unit test")).toBeTruthy();
    expect(screen.getByText("Drop the legacy endpoint")).toBeTruthy();
    // In-progress entry carries a data-status="in_progress" marker.
    expect(document.querySelector('[data-status="in_progress"]')).toBeTruthy();
  });

  it("collapses the list when the header is clicked", () => {
    render(<MessagePlan id="p1" entries={ENTRIES} />);
    const header = screen.getByTestId("message-plan").querySelector("button");
    expect(header).toBeTruthy();
    fireEvent.click(header!);
    // After collapse the entries <ol> is no longer in the document.
    expect(screen.queryByRole("list")).toBeNull();
  });
});
