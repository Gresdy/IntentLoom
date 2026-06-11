import { describe, expect, it } from "vitest";
import { formatMessageTime } from "@/chat/formatMessageTime";

const pad = (n: number) => n.toString().padStart(2, "0");
const sameDayIsoAt = (h: number, m: number): number => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
};
const earlierDayIso = (offsetDays: number, h = 9, m = 0): number => {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

describe("formatMessageTime", () => {
  it("renders HH:mm for messages sent today", () => {
    const ts = sameDayIsoAt(9, 5);
    const out = formatMessageTime(ts);
    expect(out).toBe(`${pad(9)}:${pad(5)}`);
  });

  it("renders MM-DD HH:mm for messages from earlier days", () => {
    const ts = earlierDayIso(2, 14, 30);
    const out = formatMessageTime(ts);
    const d = new Date(ts);
    expect(out).toBe(`${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(14)}:${pad(30)}`);
  });

  it("pads single-digit hours and minutes", () => {
    const ts = sameDayIsoAt(1, 7);
    expect(formatMessageTime(ts)).toBe("01:07");
  });

  it("returns empty string for non-finite timestamps", () => {
    expect(formatMessageTime(Number.NaN)).toBe("");
    expect(formatMessageTime(0)).toBe("");
    expect(formatMessageTime(-1)).toBe("");
  });

  it("returns empty string for invalid Date", () => {
    // A number that yields an Invalid Date: deliberately far in the
    // future beyond Date's overflow window.
    expect(formatMessageTime(Number.POSITIVE_INFINITY)).toBe("");
  });
});
