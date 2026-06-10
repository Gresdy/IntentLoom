import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  effectiveModelForCli,
  useModelStore,
} from "../stores/useModelStore";

/**
 * The composer-driven per-CLI model selection. Each CLI gets
 * its own slot; switching tabs preserves the previous CLI's
 * choice rather than stomping it. The store also exposes a
 * per-CLI provider slot kept in lockstep with the legacy
 * flat `currentProviderId`.
 */
describe("useModelStore: per-CLI model selection", () => {
  beforeEach(() => {
    useModelStore.setState({
      currentModelByCli: {},
      currentProviderByCli: {},
      currentProviderId: "",
    });
  });

  afterEach(() => {
    useModelStore.setState({
      currentModelByCli: {},
      currentProviderByCli: {},
      currentProviderId: "",
    });
  });

  it("returns the CLI default when no explicit choice exists", () => {
    const id = effectiveModelForCli(useModelStore.getState(), "claude");
    expect(id).toBe("claude-sonnet-4.5");
  });

  it("returns the stored value when one exists", () => {
    useModelStore.getState().setCurrentModel("claude", "claude-opus-4");
    expect(effectiveModelForCli(useModelStore.getState(), "claude")).toBe(
      "claude-opus-4",
    );
  });

  it("does NOT bleed across CLIs — switching tab restores that CLI's own choice", () => {
    useModelStore.getState().setCurrentModel("claude", "claude-opus-4");
    useModelStore.getState().setCurrentModel("codex", "o3");
    expect(effectiveModelForCli(useModelStore.getState(), "claude")).toBe(
      "claude-opus-4",
    );
    expect(effectiveModelForCli(useModelStore.getState(), "codex")).toBe("o3");
    expect(effectiveModelForCli(useModelStore.getState(), "gemini")).toBe(
      "gemini-2.5-pro",
    );
  });

  it("clearing the slot falls back to the CLI default", () => {
    useModelStore.getState().setCurrentModel("codex", "o3");
    useModelStore.getState().setCurrentModel("codex", null);
    expect(effectiveModelForCli(useModelStore.getState(), "codex")).toBe(
      "gpt-5",
    );
  });

  it("returns empty string for CLIs without a picker (hermes / openclaw)", () => {
    expect(effectiveModelForCli(useModelStore.getState(), "hermes")).toBe("");
    expect(effectiveModelForCli(useModelStore.getState(), "openclaw")).toBe("");
  });

  it("unknown cli ids fall through to empty string", () => {
    expect(effectiveModelForCli(useModelStore.getState(), "bogus-cli")).toBe("");
  });

  it("per-CLI provider slot stays in lockstep with currentProviderId when cli matches currentApp", () => {
    useModelStore.setState({ currentApp: "claude" });
    useModelStore.getState().setCurrentProviderForCli("claude", "deepseek");
    expect(useModelStore.getState().currentProviderId).toBe("deepseek");
    expect(useModelStore.getState().currentProviderByCli.claude).toBe(
      "deepseek",
    );
  });

  it("per-CLI provider slot does NOT clobber currentProviderId for a different CLI", () => {
    useModelStore.setState({
      currentApp: "claude",
      currentProviderId: "anthropic-official",
    });
    useModelStore.getState().setCurrentProviderForCli("codex", "openai-official");
    // currentProviderId stays on the claude provider; codex gets
    // its own slot. Toggling the top tab should not silently
    // flip the active provider.
    expect(useModelStore.getState().currentProviderId).toBe(
      "anthropic-official",
    );
    expect(useModelStore.getState().currentProviderByCli.codex).toBe(
      "openai-official",
    );
  });
});
