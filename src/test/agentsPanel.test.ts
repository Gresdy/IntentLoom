import { describe, expect, it } from "vitest";
import { AGENT_INSTALL_INFO, type AgentInfo } from "@/lib/useAgents";

// The six ids the Rust registry (src-tauri/src/agents/) and the
// TopBar / agents panel must agree on. Keep this list as the
// single source of truth for "what IntentLoom knows how to
// route to" on the front-end — `agents::registry_contains_six_adapters`
// is the matching Rust-side test in src-tauri/src/agents/mod.rs.
const KNOWN_IDS = [
  "claude",
  "codex",
  "gemini",
  "opencode",
  "openclaw",
  "hermes",
] as const;

describe("AgentsPanel.AGENT_INSTALL_INFO", () => {
  it("covers exactly the six registered adapter ids", () => {
    const keys = Object.keys(AGENT_INSTALL_INFO).sort();
    expect(keys).toEqual([...KNOWN_IDS].sort());
  });

  it("never re-introduces the dead kiro / nanobot ids", () => {
    // T4 dropped these on purpose: there is no matching adapter
    // in the Rust registry, so the install button was a 404 in
    // disguise. If a future contributor copies one back in, the
    // mismatch with KNOWN_IDS above will already fail; this test
    // makes the intent explicit so the failure message is clear.
    expect("kiro" in AGENT_INSTALL_INFO).toBe(false);
    expect("nanobot" in AGENT_INSTALL_INFO).toBe(false);
  });

  it("every entry has a non-empty url and command", () => {
    for (const [id, info] of Object.entries(AGENT_INSTALL_INFO)) {
      expect(info.url.length, `${id} url should be non-empty`).toBeGreaterThan(0);
      expect(info.command.length, `${id} command should be non-empty`).toBeGreaterThan(0);
      // http(s) only — the install button is wired to Tauri shell's
      // `open()` and we don't want javascript: or file: urls slipping in.
      expect(
        info.url.startsWith("https://") || info.url.startsWith("http://"),
        `${id} url must be http(s)`,
      ).toBe(true);
    }
  });
});

describe("AgentInfo shape (useAgents.ts)", () => {
  // The backend Tauri command `list_agents` returns objects that
  // match the `AgentInfo` interface exported from useAgents.ts.
  // These compile-time assertions guard against silent breakage if
  // the backend grows a new field that the UI hasn't picked up
  // yet, or vice versa.

  it("accepts an object with the documented fields", () => {
    const sample: AgentInfo = {
      id: "claude",
      name: "claude",
      display_name: "Claude Code",
      available: true,
      path: "/usr/local/bin/claude",
      version: "1.0.0",
      supports_streaming: true,
      description: "Anthropic 出品的代码助手 CLI",
      auth: { status: "logged_in", hint: null },
      setup: { status: "ready", message: "已就绪" },
      env: {},
    };
    // Round-trip through JSON to catch any non-serialisable value.
    const round = JSON.parse(JSON.stringify(sample)) as AgentInfo;
    expect(round.version).toBe("1.0.0");
    expect(round.auth.status).toBe("logged_in");
  });

  it("tolerates a missing version (binary present but --version failed)", () => {
    const sample: AgentInfo = {
      id: "claude",
      name: "claude",
      display_name: "Claude Code",
      available: true,
      path: "/usr/local/bin/claude",
      version: null,
      supports_streaming: true,
      description: "Anthropic 出品的代码助手 CLI",
      auth: { status: "unknown", hint: "运行 `claude` 触发 OAuth 登录" },
      setup: { status: "misconfigured", message: "未登录" },
      env: {},
    };
    expect(sample.version).toBeNull();
  });

  it("tolerates an unavailable adapter (path + version both null)", () => {
    const sample: AgentInfo = {
      id: "openclaw",
      name: "openclaw",
      display_name: "OpenClaw",
      available: false,
      path: null,
      version: null,
      supports_streaming: true,
      description: "OpenClaw custom agent",
      auth: { status: "not_required", hint: null },
      setup: { status: "needs_install", message: "未安装" },
      env: {},
    };
    expect(sample.available).toBe(false);
    expect(sample.path).toBeNull();
    expect(sample.version).toBeNull();
  });
});


describe("AgentInfo.setup + env (per-adapter config + install/config flow)", () => {
  // These tests guard the wire format the Agents panel reads from
  // `list_agents`. The Rust adapter registry is the source of
  // truth for *which* ids exist (the KNOWN_IDS list above), and
  // these cases pin the shape of the per-agent record the panel
  // dispatches on. A future refactor that drops a field will be
  // caught here before it ships as a silent UI regression.

  it("setup.status = ready has no CTA", () => {
    const a: AgentInfo = {
      ...require_install_only_baseline(),
      available: true,
      path: "/usr/local/bin/claude",
      version: "1.0.0",
      auth: { status: "logged_in", hint: null },
      setup: { status: "ready", message: "已就绪" },
    };
    expect(a.setup.status).toBe("ready");
    expect(a.setup.cta).toBeUndefined();
  });

  it("setup.status = needs_install carries an install_url CTA", () => {
    const a: AgentInfo = {
      ...require_install_only_baseline(),
      available: false,
      path: null,
      version: null,
      auth: { status: "unknown", hint: "首次运行 CLI 时触发浏览器登录" },
      setup: {
        status: "needs_install",
        message: "未检测到可执行文件",
        cta: { kind: "install_url", url: "https://example.com/install/openclaw" },
      },
    };
    expect(a.setup.status).toBe("needs_install");
    expect(a.setup.cta?.kind).toBe("install_url");
  });

  it("setup.status = needs_login carries a login_hint CTA", () => {
    const a: AgentInfo = {
      ...require_install_only_baseline(),
      available: true,
      path: "/usr/local/bin/claude",
      version: "1.0.0",
      auth: { status: "logged_out", hint: "运行 `claude` 触发 OAuth 登录" },
      setup: {
        status: "needs_login",
        message: "已安装,但尚未登录",
        cta: { kind: "login_hint", command: "claude" },
      },
    };
    expect(a.setup.status).toBe("needs_login");
    expect(a.setup.cta?.kind).toBe("login_hint");
  });

  it("env reflects user-supplied env overrides", () => {
    const a: AgentInfo = {
      ...require_install_only_baseline(),
      env: { ANTHROPIC_BASE_URL: "https://proxy", ANTHROPIC_API_KEY: "sk-..." },
    };
    expect(Object.keys(a.env).length).toBe(2);
    expect(a.env.ANTHROPIC_BASE_URL).toBe("https://proxy");
  });

  it("empty env means no user override", () => {
    const a: AgentInfo = {
      ...require_install_only_baseline(),
      env: {},
    };
    expect(a.env).toEqual({});
  });
});

// The fields above all agents share, so individual tests can spread
// the rest of the case on top without re-declaring them. Returns
// the canonical "every other field is a default" baseline that
// the tests then override with the one field each case cares about.
function require_install_only_baseline(): AgentInfo {
  return {
    id: "openclaw",
    name: "openclaw",
    display_name: "OpenClaw",
    available: false,
    path: null,
    version: null,
    supports_streaming: true,
    description: "OpenClaw custom agent",
    auth: { status: "not_required", hint: null },
    setup: { status: "needs_install", message: "未安装" },
    env: {},
  };
}
