import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Download, RefreshCw, Plus, Trash2, X } from "lucide-react";
import type { Skill } from "../../shared/types";
import { invoke } from "../../lib/tauri";

// `invoke` is now imported from `lib/tauri` to keep IPC entry points unified.

type TabKey = "local" | "market" | "ide" | "project" | "settings";

const IDE_OPTIONS = [
  { label: "Antigravity", value: "antigravity" },
  { label: "Claude Code", value: "claude-code" },
  { label: "CodeBuddy", value: "codebuddy" },
  { label: "Codex", value: "codex" },
  { label: "Cursor", value: "cursor" },
  { label: "Kiro", value: "kiro" },
  { label: "OpenClaw", value: "openclaw" },
  { label: "OpenCode", value: "opencode" },
  { label: "Qoder", value: "qoder" },
  { label: "Trae", value: "trae" },
  { label: "VSCode", value: "vscode" },
  { label: "Windsurf", value: "windsurf" },
];

const btnStyle: React.CSSProperties = { padding: "4px 10px", fontSize: 12, border: "1px solid var(--border)", background: "var(--bg-soft)", color: "var(--fg)", borderRadius: "var(--radius)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 };
const btnPrimaryStyle: React.CSSProperties = { ...btnStyle, background: "var(--accent)", borderColor: "var(--accent)", color: "var(--accent-fg)", fontWeight: 600 };
const btnDangerStyle: React.CSSProperties = { ...btnPrimaryStyle, background: "var(--err)", borderColor: "var(--err)", color: "#fff" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", background: "var(--bg)", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 13, boxSizing: "border-box" as const };

export const SkillsPanel: React.FC = () => {
  const [query, setQuery] = useState("");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [installed, setInstalled] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<TabKey>("local");
  const [installing, setInstalling] = useState<string | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [platform, setPlatform] = useState("claude-code");
  const [ideSkills, setIdeSkills] = useState<Skill[]>([]);
  const [showCustomIdeModal, setShowCustomIdeModal] = useState(false);
  const [customIdeForm, setCustomIdeForm] = useState({ name: "", path: "" });
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    loadInstalled();
  }, []);

  const loadInstalled = async () => {
    try {
      const list = await invoke("list_installed_skills");
      setInstalled(list as Skill[]);
      loadIdeSkills();
    } catch (err) {
      console.error("Failed to load installed skills:", err);
    }
  };

  const loadIdeSkills = async () => {
    try {
      const list = await invoke("list_installed_skills");
      const filtered = (list as Skill[]).filter((skill: Skill) =>
        skill.symlinks[platform]
      );
      setIdeSkills(filtered);
    } catch (err) {
      console.error("Failed to load IDE skills:", err);
    }
  };

  const handleImportLocalSkill = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
    });

    if (selected) {
      try {
        await invoke("_import_local_skill", { path: selected });
        await loadInstalled();
        alert("本地技能导入成功");
      } catch (err) {
        console.error("Failed to import local skill:", err);
        alert("本地技能导入失败");
      }
    }
  };

  const handleSkillSelect = (skillId: string, checked: boolean) => {
    if (checked) {
      setSelectedSkills(prev => [...prev, skillId]);
    } else {
      setSelectedSkills(prev => prev.filter(id => id !== skillId));
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const result = await invoke("search_skills", {
        query: query.trim(),
      });
      setSkills((result as { skills: Skill[] }).skills);
      setTab("market");
    } catch (err) {
      console.error("Failed to search skills:", err);
      alert("搜索技能失败，请检查网络连接");
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async (skill: Skill) => {
    setInstalling(skill.id);
    try {
      await invoke("install_skill", { skill, platform });
      await loadInstalled();
      alert("技能安装成功");
    } catch (err) {
      console.error("Failed to install skill:", err);
      alert("技能安装失败，请检查网络连接和权限");
    } finally {
      setInstalling(null);
    }
  };

  const handleUninstall = async (skillId: string) => {
    try {
      await invoke("uninstall_skill", { skillName: skillId, platform });
      await loadInstalled();
      setDeleteTarget(null);
    } catch (err) {
      console.error("Failed to uninstall skill:", err);
      alert("技能卸载失败，请检查权限");
    }
  };

  const handleBatchInstall = async () => {
    try {
      const selectedSkillsData = installed.filter(skill => selectedSkills.includes(skill.id));
      if (selectedSkillsData.length === 0) {
        alert("请先选择要安装的技能");
        return;
      }
      const results = await invoke("batch_install_skills", { skills: selectedSkillsData, platforms: [platform] });
      alert(`批量安装完成:\n${(results as string[]).join("\n")}`);
      await loadInstalled();
    } catch (err) {
      console.error("Failed to batch install:", err);
      alert("批量安装失败，请检查网络连接和权限");
    }
  };

  const handleCreateCustomIde = async () => {
    if (!customIdeForm.name || !customIdeForm.path) {
      alert("请填写完整的 IDE 信息");
      return;
    }
    try {
      await invoke("_save_ide_config", { config: customIdeForm });
      setShowCustomIdeModal(false);
      alert("自定义 IDE 创建成功");
    } catch (err) {
      console.error("Failed to create custom IDE:", err);
      alert("创建自定义 IDE 失败");
    }
  };

  const handleBatchDelete = async () => {
    if (selectedSkills.length === 0) {
      alert("请先选择要删除的技能");
      return;
    }

    if (!confirm(`确定要删除选中的 ${selectedSkills.length} 个技能吗？`)) {
      return;
    }

    try {
      for (const skillId of selectedSkills) {
        await invoke("uninstall_skill", { skillName: skillId, platform });
      }
      await loadInstalled();
      setSelectedSkills([]);
      alert("批量删除成功");
    } catch (err) {
      console.error("Failed to batch delete:", err);
      alert("批量删除失败，请检查权限");
    }
  };

  const handleDeleteAll = async () => {
    if (installed.length === 0) {
      alert("暂无技能可删除");
      return;
    }

    if (!confirm(`确定要删除所有 ${installed.length} 个技能吗？`)) {
      return;
    }

    try {
      for (const skill of installed) {
        await invoke("uninstall_skill", { skillName: skill.id, platform });
      }
      await loadInstalled();
      setSelectedSkills([]);
      alert("全部删除成功");
    } catch (err) {
      console.error("Failed to delete all:", err);
      alert("全部删除失败，请检查权限");
    }
  };

  const handleInstallToIde = async (skill: Skill) => {
    try {
      await invoke("install_skill", { skill, platform });
      await loadInstalled();
      alert("技能安装到 IDE 成功");
    } catch (err) {
      console.error("Failed to install to IDE:", err);
      alert("技能安装到 IDE 失败，请检查权限");
    }
  };

  const handleOpenFolder = async (skill: Skill) => {
    if (skill.local_path) {
      try {
        await invoke("_open_folder", { path: skill.local_path });
      } catch (err) {
        console.error("Failed to open folder:", err);
        alert("打开文件夹失败");
      }
    }
  };

  return (
    <div className="h-full flex flex-col ilo-bg-elev">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b ilo-border-soft">
        <div className="flex space-x-0">
          {(["local", "market", "ide", "project", "settings"] as TabKey[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 font-medium transition-all duration-200 ${
                tab === t ? "bg-black ilo-fg-onaccent" : "ilo-fg-faint hover:ilo-bg-soft"
              }`}
            >
              {t === "local" ? "Local Skills" : t === "market" ? "Market" : t === "ide" ? "IDE Browser" : t === "project" ? "Projects" : "Settings"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm">🌐</span>
          <span className="text-sm">⚙️</span>
        </div>
      </div>

      {/* Delete Confirm — 统一的 drawer chrome */}
      {deleteTarget && (
        <div className="drawer-backdrop" onClick={() => setDeleteTarget(null)}>
          <aside className="drawer drawer--narrow">
            <header className="drawer__head">
              <div className="drawer__title">
                <Trash2 size={14} className="ilo-fg-warn" />
                删除技能
              </div>
              <button className="chip chip--icon" onClick={() => setDeleteTarget(null)} title="关闭">
                <X size={14} />
              </button>
            </header>
            <div className="drawer__body drawer__body--single">
              <p style={{ margin: 0, color: "var(--fg-dim)", fontSize: 13 }}>确定要删除这个技能吗？</p>
            </div>
            <footer className="drawer__actions">
              <button className="btn" onClick={() => setDeleteTarget(null)}>取消</button>
              <button className="btn" style={btnDangerStyle} onClick={() => handleUninstall(deleteTarget)}>删除</button>
            </footer>
          </aside>
        </div>
      )}

      {/* Custom IDE Modal — 统一的 drawer chrome */}
      {showCustomIdeModal && (
        <div className="drawer-backdrop" onClick={() => setShowCustomIdeModal(false)}>
          <aside className="drawer drawer--narrow">
            <header className="drawer__head">
              <div className="drawer__title">
                <Plus size={14} className="ilo-fg-accent" />
                添加自定义 IDE
              </div>
              <button className="chip chip--icon" onClick={() => setShowCustomIdeModal(false)} title="关闭">
                <X size={14} />
              </button>
            </header>
            <div className="drawer__body drawer__body--single" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, color: "var(--fg-dim)", marginBottom: 4 }}>IDE 名称 *</label>
                <input
                  style={inputStyle}
                  value={customIdeForm.name}
                  onChange={(e) => setCustomIdeForm({ ...customIdeForm, name: e.target.value })}
                  placeholder="例如：MyCustomIDE"
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, color: "var(--fg-dim)", marginBottom: 4 }}>技能路径 *</label>
                <input
                  style={inputStyle}
                  value={customIdeForm.path}
                  onChange={(e) => setCustomIdeForm({ ...customIdeForm, path: e.target.value })}
                  placeholder="例如：/Users/username/.myide/skills"
                />
              </div>
            </div>
            <footer className="drawer__actions">
              <button className="btn" onClick={() => setShowCustomIdeModal(false)}>取消</button>
              <button className="btn btn--primary" onClick={handleCreateCustomIde}>确定</button>
            </footer>
          </aside>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {tab === "local" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold ilo-fg-faint">Local Skills</h2>
              <p className="text-sm ilo-fg-dim mt-1">To import local skills, select the folder containing SKILL.md.</p>
              <div className="flex items-center justify-between mt-2">
                <div className="text-sm font-medium ilo-fg-faint">
                  Total {installed.length}
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedSkills(installed.map(skill => skill.id));
                      } else {
                        setSelectedSkills([]);
                      }
                    }}
                    className="mr-2"
                  />
                  <span className="text-sm ilo-fg-faint">Select all</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <input
                type="text"
                placeholder="Search name, description or path"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ ...inputStyle, maxWidth: 480 }}
              />
              <div className="text-sm ilo-fg-dim ml-4">
                Showing {installed.length} / {installed.length}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button style={btnStyle} onClick={loadInstalled}><RefreshCw size={14} /> Refresh</button>
              <button style={btnPrimaryStyle} onClick={handleImportLocalSkill}><Plus size={14} /> Import Local Skill</button>
              <button style={btnStyle} disabled={selectedSkills.length === 0} onClick={handleBatchInstall}>Batch install to IDE ({selectedSkills.length})</button>
              <button style={btnDangerStyle} disabled={selectedSkills.length === 0} onClick={handleBatchDelete}>Delete selected ({selectedSkills.length})</button>
              <button style={btnDangerStyle} onClick={handleDeleteAll}>Delete all</button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="ico spin" style={{ fontSize: 24 }}>&#9881;</div>
              </div>
            ) : installed.length > 0 ? (
              <div className="space-y-2">
                {installed.map((skill, index) => (
                  <div
                    key={skill.id}
                    className="border ilo-border-soft rounded-lg p-3 hover:ilo-border transition-all duration-200"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedSkills.includes(skill.id)}
                        onChange={(e) => handleSkillSelect(skill.id, e.target.checked)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium ilo-fg-faint">{index + 1}. {skill.name}</h3>
                        </div>
                        {Object.keys(skill.symlinks).length > 0 ? (
                          <p className="text-sm ilo-fg-faint mt-1">Linked to {Object.keys(skill.symlinks).join(' / ')}</p>
                        ) : (
                          <p className="text-sm ilo-fg-dim mt-1">Not linked</p>
                        )}
                        {skill.description && (
                          <p className="text-sm ilo-fg-faint mt-1">{skill.description}</p>
                        )}
                        <p className="text-xs ilo-fg-dim mt-1">{skill.local_path}</p>

                        <div className="flex flex-wrap gap-1 mt-2">
                          {IDE_OPTIONS.map((ide) => (
                            <span
                              key={ide.value}
                              className="badge"
                              style={skill.symlinks[ide.value] ? { color: "var(--ok)", borderColor: "var(--ok)" } : undefined}
                            >
                              {ide.label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button style={btnPrimaryStyle} onClick={() => handleInstallToIde(skill)}>Install to IDE</button>
                        <button style={btnStyle} onClick={() => handleOpenFolder(skill)}>Open Folder</button>
                        <button style={btnDangerStyle} onClick={() => setDeleteTarget(skill.id)}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border ilo-border-soft rounded-lg p-8 text-center">
                <div style={{ padding: 40, textAlign: "center", color: "var(--fg-faint)", fontSize: 13 }}>暂未安装任何 Skill</div>
              </div>
            )}
          </div>
        )}

        {tab === "market" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold ilo-fg-faint">Marketplace Search</h2>

            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Search skills (name / description / author)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button style={btnPrimaryStyle} onClick={handleSearch}>Search</button>
              <button style={btnStyle} onClick={loadInstalled}>Refresh</button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="ico spin" style={{ fontSize: 24 }}>&#9881;</div>
              </div>
            ) : skills.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {skills.map((skill) => (
                  <div
                    key={skill.id}
                    className="border ilo-border-soft rounded-lg p-4 hover:ilo-border transition-all duration-200"
                  >
                    <h3 className="font-medium ilo-fg-faint text-lg mb-2">{skill.name}</h3>
                    <div className="flex items-center gap-2 text-sm ilo-fg-faint mb-2">
                      <span>作者 {skill.author}</span>
                      {skill.version && <span>• v{skill.version}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-sm ilo-fg-dim mb-3">
                      <span>⭐ {Math.floor(Math.random() * 10000)}</span>
                      <span>↓ {Math.floor(Math.random() * 5000)}</span>
                    </div>
                    <p className="text-sm ilo-fg-faint mb-3">{skill.description}</p>
                    <div className="text-xs ilo-fg-dim mb-3">
                      Source: {skill.source}
                    </div>
                    {skill.repo_url && (
                      <div className="text-xs ilo-fg-dim mb-3 break-all">
                        {skill.repo_url}
                      </div>
                    )}
                    <button
                      style={{ ...btnPrimaryStyle, width: "100%", justifyContent: "center" }}
                      disabled={installing === skill.id || !skill.repo_url}
                      onClick={() => handleInstall(skill)}
                    >
                      <Download size={14} />
                      {installing === skill.id ? "Installing..." : "Download"}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border ilo-border-soft rounded-lg p-8 text-center">
                <div style={{ padding: 40, textAlign: "center", color: "var(--fg-faint)", fontSize: 13 }}>搜索 Skills 后在此显示</div>
              </div>
            )}
          </div>
        )}

        {tab === "ide" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold ilo-fg-faint">IDE Browser</h2>
              <div className="text-sm ilo-fg-faint">
                {ideSkills.length} skills
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {IDE_OPTIONS.map((ide) => (
                <button
                  key={ide.value}
                  style={platform === ide.value ? btnPrimaryStyle : btnStyle}
                  onClick={() => {
                    setPlatform(ide.value);
                    loadIdeSkills();
                  }}
                >
                  {ide.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2 mb-4">
              <input type="text" placeholder="IDE name" style={{ ...inputStyle, flex: 1 }} />
              <input type="text" placeholder="e.g., myide/skills" style={{ ...inputStyle, flex: 1 }} />
              <button style={btnPrimaryStyle}>Add IDE</button>
            </div>

            {ideSkills.length > 0 ? (
              <div className="space-y-2">
                {ideSkills.map((skill, index) => (
                  <div
                    key={skill.id}
                    className="border ilo-border-soft rounded-lg p-3 hover:ilo-border transition-all duration-200"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium ilo-fg-faint">{index + 1}. {skill.name}</h3>
                          <span className="text-xs font-medium text-green-600">{platform} - Linked</span>
                        </div>
                        <p className="text-xs ilo-fg-dim mt-1">{skill.symlinks[platform]}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button style={btnStyle} onClick={() => handleOpenFolder(skill)}>Open Folder</button>
                        <button style={btnDangerStyle} onClick={() => handleUninstall(skill.id)}>Uninstall</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border ilo-border-soft rounded-lg p-8 text-center">
                <div style={{ padding: 40, textAlign: "center", color: "var(--fg-faint)", fontSize: 13 }}>当前 IDE ({platform}) 暂无已安装的技能</div>
              </div>
            )}
          </div>
        )}

        {tab === "project" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold ilo-fg-faint">Projects</h2>
              <button style={btnPrimaryStyle}>Add Project</button>
            </div>
            <p className="text-sm ilo-fg-faint">Configure separate Skills environments for different projects.</p>

            <div className="border ilo-border-soft rounded-lg p-4">
              <div className="border ilo-border-soft rounded-lg p-3 mb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium ilo-fg-faint">demo</h3>
                    <p className="text-xs ilo-fg-dim">/Users/wrt/IdeaProjects/demo</p>
                    <p className="text-xs ilo-fg-faint mt-1">IDE Targets: 3</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      <span className="badge" style={{ color: "var(--ok)", borderColor: "var(--ok)" }}>Cursor</span>
                      <span className="badge" style={{ color: "var(--ok)", borderColor: "var(--ok)" }}>Claude Code</span>
                      <span className="badge" style={{ color: "var(--ok)", borderColor: "var(--ok)" }}>Qoder</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button style={btnStyle}>Deselect</button>
                    <button style={btnStyle}>Configure</button>
                    <button style={btnStyle}>Open Directory</button>
                    <button style={btnPrimaryStyle}>Link Skills</button>
                    <button style={btnDangerStyle}>Remove</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold ilo-fg-faint">Settings</h2>
            <div className="border ilo-border-soft rounded-lg p-6">
              <p className="text-sm ilo-fg-faint">Skills Manager settings will be available here.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
