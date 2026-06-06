import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { ReactNode } from "react";

// vi.mock is hoisted, so the spy exists before any module that
// imports `@/lib/tauri` runs.
const invokeMock = vi.fn();
vi.mock("@/lib/tauri", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));

// The controller wires `ai-stream-chunk` and `ai-stream-end`
// listeners on mount. jsdom + the real `@tauri-apps/api/event`
// would never resolve those, so mock them with a no-op.
vi.mock("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => {}),
}));

import { useReasonixController } from "@/lib/reasonixAdapter";

const STORAGE_KEY = "intentloom.cwd";

// Render the controller into a throwaway div and return a promise
// that resolves with the rendered instance. We use React's own
// `createRoot` (no @testing-library) because we only need the hook
// return value, not any DOM interaction.
function mountController(): {
  pickWorkspace: () => Promise<string | null>;
  getCwd: () => string | undefined;
  unmount: () => void;
} {
  const host = document.createElement("div");
  document.body.appendChild(host);
  let captured: ReturnType<typeof useReasonixController> | null = null;
  const Capture = () => {
    const c = useReasonixController();
    useEffect(() => {
      captured = c;
    });
    return null as unknown as ReactNode;
  };
  let root: Root;
  act(() => {
    root = createRoot(host);
    root.render(<Capture />);
  });
  // The controller writes captured inside an effect, so we have to
  // wait one microtask before it is observable.
  return {
    pickWorkspace: async () => {
      if (!captured) throw new Error("controller never captured");
      return captured.pickWorkspace();
    },
    getCwd: () => captured?.state.meta?.cwd,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      document.body.removeChild(host);
    },
  };
}

describe("reasonixAdapter.pickWorkspace", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("returns null and leaves state untouched when the user cancels", async () => {
    invokeMock.mockResolvedValueOnce(null);
    const c = mountController();

    let picked: string | null = "sentinel";
    await act(async () => {
      picked = await c.pickWorkspace();
    });

    expect(invokeMock).toHaveBeenCalledWith("pick_workspace");
    expect(picked).toBeNull();
    expect(c.getCwd()).toBeUndefined();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    c.unmount();
  });

  it("updates state.meta.cwd and persists to localStorage on a real pick", async () => {
    invokeMock.mockResolvedValueOnce("/Users/me/code/intentloom");
    const c = mountController();

    let picked: string | null = null;
    await act(async () => {
      picked = await c.pickWorkspace();
    });

    expect(picked).toBe("/Users/me/code/intentloom");
    expect(c.getCwd()).toBe("/Users/me/code/intentloom");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("/Users/me/code/intentloom");
    c.unmount();
  });

  it("hydrates cwd from localStorage on remount so the choice survives a reload", async () => {
    localStorage.setItem(STORAGE_KEY, "/Users/me/code/persisted");
    const c = mountController();

    expect(c.getCwd()).toBe("/Users/me/code/persisted");
    // We never invoked pick_workspace in this test, so the spy
    // should still be untouched.
    expect(invokeMock).not.toHaveBeenCalled();
    c.unmount();
  });

  it("swallows hard IPC errors so a broken dialog does not break the UI", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    invokeMock.mockRejectedValueOnce(new Error("ipc broken"));
    const c = mountController();

    let picked: string | null = "sentinel";
    await act(async () => {
      picked = await c.pickWorkspace();
    });

    expect(picked).toBeNull();
    expect(c.getCwd()).toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
    c.unmount();
  });
});
