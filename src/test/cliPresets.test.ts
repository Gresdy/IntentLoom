import { describe, expect, it } from "vitest";
import {
  CLI_MODELS,
  defaultModelForCli,
  findModel,
  modelSupportsReasoning,
  modelsForCli,
} from "../config/cliPresets";
import { getModeSpec, getReasoningSpec } from "../lib/cliCapabilities";

describe("cliPresets: per-CLI model catalog", () => {
  it("returns a non-empty model list for the 4 main CLIs", () => {
    expect(modelsForCli("claude").length).toBeGreaterThan(0);
    expect(modelsForCli("codex").length).toBeGreaterThan(0);
    expect(modelsForCli("gemini").length).toBeGreaterThan(0);
    expect(modelsForCli("opencode").length).toBeGreaterThan(0);
  });

  it("returns an empty list for CLIs without a picker", () => {
    // hermes / openclaw own their own model config — no picker.
    expect(modelsForCli("hermes")).toEqual([]);
    expect(modelsForCli("openclaw")).toEqual([]);
  });

  it("'claude-code' legacy id aliases to the canonical claude list", () => {
    expect(modelsForCli("claude-code")).toEqual(modelsForCli("claude"));
  });

  it("every model has a stable id and label", () => {
    for (const cli of ["claude", "codex", "gemini", "opencode"] as const) {
      for (const m of modelsForCli(cli)) {
        expect(m.id.length).toBeGreaterThan(0);
        expect(m.label.length).toBeGreaterThan(0);
        // Stable id should not contain spaces — it's forwarded to the
        // CLI flag / env verbatim and a space would break argv parsing.
        expect(m.id).not.toMatch(/\s/);
      }
    }
  });
});

describe("cliPresets: default model per CLI", () => {
  it("returns the canonical default for each main CLI", () => {
    expect(defaultModelForCli("claude")).toBe("claude-sonnet-4.5");
    expect(defaultModelForCli("codex")).toBe("gpt-5");
    expect(defaultModelForCli("gemini")).toBe("gemini-2.5-pro");
    expect(defaultModelForCli("opencode")).toBe("default");
  });

  it("returns empty string for CLIs without a picker", () => {
    expect(defaultModelForCli("hermes")).toBe("");
    expect(defaultModelForCli("openclaw")).toBe("");
  });

  it("'claude-code' aliases to the canonical claude default", () => {
    expect(defaultModelForCli("claude-code")).toBe("claude-sonnet-4.5");
  });

  it("every default id is present in the catalog", () => {
    for (const cli of ["claude", "codex", "gemini", "opencode"] as const) {
      const id = defaultModelForCli(cli);
      if (!id) continue; // skip empty
      expect(CLI_MODELS[cli].some((m) => m.id === id)).toBe(true);
    }
  });
});

describe("cliPresets: findModel", () => {
  it("returns the matching model", () => {
    const m = findModel("claude", "claude-opus-4");
    expect(m?.label).toBe("Opus 4");
  });

  it("returns null for unknown ids and nullish inputs", () => {
    expect(findModel("claude", "does-not-exist")).toBeNull();
    expect(findModel("claude", null)).toBeNull();
    expect(findModel("claude", undefined)).toBeNull();
    expect(findModel("claude", "")).toBeNull();
  });
});

describe("cliCapabilities: mode / model / reasoning are independent", () => {
  // The three composer dropdowns are deliberately not linked —
  // the user explicitly asked for them to be independent
  // selectors. Earlier code had a `getEffectiveReasoningSpec`
  // that hid the reasoning dropdown when the chosen model
  // lacked reasoning; that helper was removed in favour of a
  // straight `getReasoningSpec(cli)` lookup so the user keeps
  // the reasoning control no matter which model they pick.
  it("reasoning spec is rendered whenever the CLI has one — no model gating", () => {
    expect(getReasoningSpec("claude")).toBeDefined();
    expect(getReasoningSpec("codex")).toBeDefined();
    // gemini has no reasoning spec → spec is undefined regardless
    // of the model.
    expect(getReasoningSpec("gemini")).toBeUndefined();
    expect(getReasoningSpec("hermes")).toBeUndefined();
    expect(getReasoningSpec("openclaw")).toBeUndefined();
  });

  it("mode spec is rendered whenever the CLI has one", () => {
    expect(getModeSpec("claude")).toBeDefined();
    expect(getModeSpec("codex")).toBeDefined();
    expect(getModeSpec("gemini")).toBeDefined();
    expect(getModeSpec("hermes")).toBeUndefined();
  });

  it("modelSupportsReasoning still classifies correctly (used for future UI hints)", () => {
    // The `supportsReasoning` flag on the model catalog stays
    // as a *passive* signal — the user can still pick a no-
    // reasoning model and the CLI's downstream behaviour
    // (gemini: silently dropped; claude/codex: still emitted)
    // owns whether the flag is honoured.
    expect(modelSupportsReasoning("claude", "claude-haiku-4")).toBe(false);
    expect(modelSupportsReasoning("claude", "claude-sonnet-4.5")).toBe(true);
    expect(modelSupportsReasoning("claude", "claude-opus-4")).toBe(true);
  });
});
