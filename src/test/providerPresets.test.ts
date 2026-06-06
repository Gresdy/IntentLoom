import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  claudeProviderPresets,
  presetToProvider,
  seedProvidersFromPresets,
} from "@/config/providerPresets";
import { useModelStore } from "@/stores/useModelStore";

describe("presetToProvider", () => {
  it("maps a DeepSeek-style preset to a proxy Provider with the right env", () => {
    const p = presetToProvider({
      name: "DeepSeek",
      websiteUrl: "https://platform.deepseek.com",
      settingsConfig: {
        env: {
          ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
          ANTHROPIC_AUTH_TOKEN: "",
          ANTHROPIC_MODEL: "DeepSeek-V3",
        },
      },
      category: "cn_official",
    });
    expect(p).toMatchObject({
      id: "deepseek",
      name: "DeepSeek",
      type: "proxy",
      api_base: "https://api.deepseek.com/anthropic",
    });
    // Empty ANTHROPIC_AUTH_TOKEN is still surfaced as
    // api_key="" so the field round-trips; downstream code
    // that needs a real token checks truthiness.
    expect(p.api_key).toBe("");
  });

  it("maps 'official' category to the 'official' Provider.type", () => {
    const p = presetToProvider({
      name: "Claude Official",
      websiteUrl: "https://anthropic.com",
      settingsConfig: { env: {} },
      category: "official",
    });
    expect(p.type).toBe("official");
    // No env means no api_base at all. api_key is still
    // surfaced as "" so the "missing credential" state is
    // explicit in the UI (vs. the provider not having the
    // field at all, which would mean "unknown" not "empty").
    expect(p.api_base).toBeUndefined();
    expect(p.api_key).toBe("");
  });

  it("maps 'cloud_provider' category to 'aws-bedrock'", () => {
    const p = presetToProvider({
      name: "AWS Bedrock",
      websiteUrl: "https://aws.amazon.com/bedrock",
      settingsConfig: { env: {} },
      category: "cloud_provider",
    });
    expect(p.type).toBe("aws-bedrock");
  });

  it("produces a stable id from the preset name (deterministic across calls)", () => {
    const preset = {
      name: "Zhipu GLM",
      websiteUrl: "https://z.ai",
      settingsConfig: { env: {} },
      category: "cn_official" as const,
    };
    const a = presetToProvider(preset);
    const b = presetToProvider(preset);
    expect(a.id).toBe("zhipu-glm");
    expect(b.id).toBe("zhipu-glm");
    expect(a.id).toBe(b.id);
  });

  it("falls back to 'unnamed' for an all-non-ASCII name (defensive)", () => {
    const p = presetToProvider({
      name: "智谱",
      websiteUrl: "",
      settingsConfig: { env: {} },
      category: "cn_official",
    });
    // "智谱" stripped of non-ASCII leaves an empty string; the
    // fallback "unnamed" keeps the id non-empty so the
    // providers map can store it without colliding on "".
    expect(p.id).toBe("unnamed");
  });
});

describe("seedProvidersFromPresets (T10)", () => {
  beforeEach(() => {
    useModelStore.setState({
      currentApp: "claude",
      currentProviderId: "",
      currentCli: "claude-code",
      providers: {},
    });
  });

  it("registers every preset into the providers map", () => {
    const register = vi.fn();
    seedProvidersFromPresets(register, claudeProviderPresets);
    expect(register).toHaveBeenCalledTimes(claudeProviderPresets.length);
  });

  it("writes the converted providers into useModelStore via registerProvider", () => {
    seedProvidersFromPresets(
      useModelStore.getState().registerProvider,
      claudeProviderPresets,
    );
    const providers = useModelStore.getState().providers;
    // Spot-check: a couple of well-known presets should land
    // in the map under their slugified ids.
    expect(providers["deepseek"]).toMatchObject({
      name: "DeepSeek",
      type: "proxy",
    });
    expect(providers["claude-official"]).toMatchObject({
      name: "Claude Official",
      type: "official",
    });
  });

  it("is idempotent: re-running the seed does not churn existing entries", () => {
    const register = useModelStore.getState().registerProvider;
    seedProvidersFromPresets(register, claudeProviderPresets);
    const beforeKeys = Object.keys(useModelStore.getState().providers).sort();

    // Tamper with one entry to verify the second seed does not
    // overwrite it (the doc comment on registerProvider is
    // explicit about "first registration wins").
    useModelStore.setState((s) => ({
      providers: { ...s.providers, deepseek: { ...s.providers.deepseek, name: "tampered" } },
    }));

    seedProvidersFromPresets(register, claudeProviderPresets);
    const afterKeys = Object.keys(useModelStore.getState().providers).sort();
    expect(afterKeys).toEqual(beforeKeys);
    expect(useModelStore.getState().providers.deepseek.name).toBe("tampered");
  });

  it("does not touch currentProviderId — startup seed never clobbers the user's pick", () => {
    // Pre-set a current provider id to a value the seed won't
    // touch. After seeding, the same id should still be the
    // current selection.
    useModelStore.setState({ currentProviderId: "anthropic-direct" });
    seedProvidersFromPresets(
      useModelStore.getState().registerProvider,
      claudeProviderPresets,
    );
    expect(useModelStore.getState().currentProviderId).toBe("anthropic-direct");
  });

  it("falls back to claudeProviderPresets when no presets list is passed", () => {
    const register = vi.fn();
    seedProvidersFromPresets(register);
    expect(register).toHaveBeenCalledTimes(claudeProviderPresets.length);
  });
});
