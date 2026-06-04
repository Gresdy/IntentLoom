import { beforeEach, describe, expect, it } from "vitest";
import { useModelStore, selectCurrentProvider } from "@/stores/useModelStore";
import type { Provider } from "@/shared/types";

const makeProvider = (id: string, name: string): Provider =>
  ({
    id,
    name,
    type: "claude",
    cli: "claude-code",
    enabled: true,
    settingsConfig: { ANTHROPIC_MODEL: `${name}-opus` },
  } as unknown as Provider);

describe("useModelStore", () => {
  beforeEach(() => {
    useModelStore.setState({
      currentApp: "claude",
      currentProviderId: "",
      currentCli: "claude-code",
      providers: {},
    });
  });

  it("setCurrentProvider stores the provider and selects it", () => {
    const p = makeProvider("p1", "P-One");
    useModelStore.getState().setCurrentProvider(p);
    expect(useModelStore.getState().currentProviderId).toBe("p1");
    expect(useModelStore.getState().providers.p1).toMatchObject({ id: "p1", name: "P-One" });
  });

  it("setCurrentProvider(null) clears the current selection", () => {
    useModelStore.getState().setCurrentProvider(makeProvider("p1", "P-One"));
    useModelStore.getState().setCurrentProvider(null);
    expect(useModelStore.getState().currentProviderId).toBe("");
  });

  it("switchProvider only switches when the id exists", () => {
    useModelStore.getState().setCurrentProvider(makeProvider("p1", "P-One"));
    useModelStore.getState().switchProvider("missing");
    expect(useModelStore.getState().currentProviderId).toBe("p1");
    useModelStore.getState().switchProvider("p1");
    expect(useModelStore.getState().currentProviderId).toBe("p1");
  });

  it("selectCurrentProvider returns the current provider or null", () => {
    expect(selectCurrentProvider(useModelStore.getState())).toBeNull();
    const p = makeProvider("p1", "P-One");
    useModelStore.getState().setCurrentProvider(p);
    expect(selectCurrentProvider(useModelStore.getState())?.id).toBe("p1");
  });
});
