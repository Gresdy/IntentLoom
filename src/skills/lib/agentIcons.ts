const AGENT_ICON_FILES: Record<string, string> = {
  adal: "adal.png",
  amp: "amp.svg",
  antigravity: "antigravity.png",
  augment: "augment.svg",
  bob: "bob.png",
  claude_code: "claude_code.svg",
  cline: "cline.png",
  codebuddy: "codebuddy.svg",
  codex: "codex.svg",
  command_code: "command_code.svg",
  continue: "continue.png",
  cortex: "cortex.png",
  crush: "crush.png",
  cursor: "cursor.png",
  deepagents: "deepagents.png",
  droid: "droid.svg",
  firebender: "firebender.svg",
  gemini_cli: "gemini_cli.svg",
  github_copilot: "github_copilot.png",
  goose: "goose.png",
  grok: "grok.svg",
  hermes: "hermes.png",
  iflow: "iflow.png",
  junie: "junie.png",
  kilo_code: "kilo_code.svg",
  kimi: "kimi.svg",
  kiro: "kiro.svg",
  kode: "kode.png",
  mcpjam: "mcpjam.png",
  mistral_vibe: "mistral_vibe.svg",
  mux: "mux.png",
  neovate: "neovate.png",
  openclaw: "openclaw.svg",
  omp_agent: "oh_my_pi.svg",
  opencode: "opencode.png",
  openhands: "openhands.png",
  pi: "pi.svg",
  pochi: "pochi.png",
  qoder: "qoder.svg",
  qwen_code: "qwen_code.png",
  replit: "replit.png",
  roo_code: "roo_code.svg",
  trae: "trae.svg",
  trae_cn: "trae_cn.svg",
  warp: "warp.svg",
  windsurf: "windsurf.svg",
  zencoder: "zencoder.png",
};

export function getAgentIconSrc(agentKey: string): string | null {
  const file = AGENT_ICON_FILES[agentKey];
  return file ? `/agent-icons/${file}` : null;
}

export function hasAgentIcon(agentKey: string): boolean {
  return Boolean(AGENT_ICON_FILES[agentKey]);
}
