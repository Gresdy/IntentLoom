import { describe, expect, it } from "vitest";
import {
  CLI_MODELS,
  defaultModelForCli,
  findModel,
  modelSupportsReasoning,
  modelsForCli,
} from "../config/cliPresets";
import { getEffectiveReasoningSpec, getModeSpec } from "../lib/cliCapabilities";

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

describe("cliPresets ↔ cliCapabilities: reasoning / model linkage", () => {
  it("claude-haiku-4 disables the reasoning dropdown", () => {
    expect(modelSupportsReasoning("claude", "claude-haiku-4")).toBe(false);
    expect(getEffectiveReasoningSpec("claude", "claude-haiku-4")).toBeUndefined();
  });

  it("claude-sonnet-4.5 keeps the reasoning dropdown", () => {
    expect(modelSupportsReasoning("claude", "claude-sonnet-4.5")).toBe(true);
    expect(getEffectiveReasoningSpec("claude", "claude-sonnet-4.5")).toBeDefined();
  });

  it("claude-opus-4 keeps the reasoning dropdown", () => {
    expect(modelSupportsReasoning("claude", "claude-opus-4")).toBe(true);
    expect(getEffectiveReasoningSpec("claude", "claude-opus-4")).toBeDefined();
  });

  it("gemini never exposes reasoning (no spec in CLI_CAPABILITIES)", () => {
    // gemini has no reasoning spec on the CLI side, so the
    // effective helper returns undefined regardless of model.
    expect(getEffectiveReasoningSpec("gemini", "gemini-2.5-pro")).toBeUndefined();
    expect(getEffectiveReasoningSpec("gemini", "gemini-2.5-flash")).toBeUndefined();
  });

  it("codex's reasoning spec is preserved for reasoning-capable models", () => {
    expect(getEffectiveReasoningSpec("codex", "gpt-5")).toBeDefined();
    expect(getEffectiveReasoningSpec("codex", "o3")).toBeDefined();
    // gpt-5-nano has supportsReasoning=false in the catalog
    expect(getEffectiveReasoningSpec("codex", "gpt-5-nano")).toBeUndefined();
  });

  it("unknown model ids fall open (treat as reasoning-capable)", () => {
    // Forward-compat: a model the catalog does not list yet
    // should NOT collapse the dropdown. The user might be on
    // a CLI whose bundled `modelsForCli` lags behind the
    // upstream release.
    expect(getEffectiveReasoningSpec("claude", "unknown-model-xyz")).toBeDefined();
    expect(getEffectiveReasoningSpec("codex", "future-gpt-6")).toBeDefined();
  });

  it("mode spec is unaffected by the model-selection gate", () => {
    // Mode dropdown is independent — every CLI that has a
    // mode spec keeps it regardless of which model is
    // selected. The user complained about the model↔reasoning
    // link, not model↔mode.
    expect(getModeSpec("claude")).toBeDefined();
    expect(getModeSpec("codex")).toBeDefined();
    expect(getModeSpec("gemini")).toBeDefined();
    expect(getModeSpec("hermes")).toBeUndefined();
  });
});
