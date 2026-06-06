import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

const invokeMock = vi.fn();
vi.mock("@/lib/tauri", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => {}),
}));

import { useReasonixController } from "@/lib/reasonixAdapter";
import { useModelStore } from "@/stores/useModelStore";
import type { Provider } from "@/shared/types";

function mountController(): {
  setModel: (id: string) => boolean;
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
    return null;
  };
  let root: Root;
  act(() => {
    root = createRoot(host);
    root.render(createElement(Capture));
  });
  return {
    setModel: (id) => {
      if (!captured) throw new Error("controller never captured");
      return captured.setModel(id);
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      document.body.removeChild(host);
    },
  };
}

const providerFixture = (id: string, name: string): Provider =>
  ({
    id,
    name,
    type: "official",
  } as unknown as Provider);

describe("reasonixAdapter.setModel", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    useModelStore.setState({
      currentApp: "claude",
      currentProviderId: "",
      currentCli: "claude-code",
      providers: {},
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("routes a known provider id to switchProvider, leaving currentApp alone", () => {
    useModelStore
      .getState()
      .setCurrentProvider(providerFixture("anthropic", "Anthropic Official"));
    const before = useModelStore.getState().currentApp;
    const c = mountController();

    let ok = false;
    act(() => {
      ok = c.setModel("anthropic");
    });

    expect(ok).toBe(true);
    expect(useModelStore.getState().currentProviderId).toBe("anthropic");
    expect(useModelStore.getState().currentApp).toBe(before);
    c.unmount();
  });

  it("routes an unknown id to setCurrentApp (top-bar CLI id path)", () => {
    useModelStore.getState().setCurrentApp("claude");
    const c = mountController();

    let ok = false;
    act(() => {
      ok = c.setModel("codex");
    });

    expect(ok).toBe(true);
    expect(useModelStore.getState().currentApp).toBe("codex");
    expect(useModelStore.getState().currentProviderId).toBe("");
    c.unmount();
  });

  it("rejects empty / whitespace-only ids without mutating either store field", () => {
    useModelStore.getState().setCurrentApp("claude");
    const beforeApp = useModelStore.getState().currentApp;
    const c = mountController();

    expect(c.setModel("")).toBe(false);
    expect(c.setModel("   ")).toBe(false);
    expect(useModelStore.getState().currentApp).toBe(beforeApp);
    c.unmount();
  });

  it("trims whitespace before routing so ' anthropic ' behaves the same as 'anthropic'", () => {
    useModelStore
      .getState()
      .setCurrentProvider(providerFixture("anthropic", "Anthropic Official"));
    const c = mountController();

    let ok = false;
    act(() => {
      ok = c.setModel("  anthropic  ");
    });

    expect(ok).toBe(true);
    expect(useModelStore.getState().currentProviderId).toBe("anthropic");
    c.unmount();
  });

  it("prefers switchProvider over setCurrentApp when both could match", () => {
    // If a provider is registered with id == currentApp (e.g. the
    // default "claude" provider), switching the menu should
    // activate the provider, not the app — the user picked
    // "claude" from the provider menu, not the CLI tab.
    useModelStore
      .getState()
      .setCurrentProvider(providerFixture("claude", "Claude Default"));
    useModelStore.getState().setCurrentApp("gemini");
    const c = mountController();

    act(() => {
      c.setModel("claude");
    });

    expect(useModelStore.getState().currentProviderId).toBe("claude");
    // currentApp is NOT touched on the provider path.
    expect(useModelStore.getState().currentApp).toBe("gemini");
    c.unmount();
  });
});
