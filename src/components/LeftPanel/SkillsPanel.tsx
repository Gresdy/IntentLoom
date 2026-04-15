import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Input, Button, Spin, Empty, Modal, Form, Checkbox, Tag, Popconfirm } from "@arco-design/web-react";
import { Download, Refresh, Plus } from "@icon-park/react";
import type { Skill } from "../../shared/types";

// 动态导入invoke函数
const invoke = async (command: string, args?: any) => {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke(command, args);
};

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
      alert("技能卸载成功");
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
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
        <div className="flex space-x-0">
          <button
            onClick={() => setTab("local")}
            className={`px-4 py-2 font-medium transition-all duration-200 ${
              tab === "local"
                ? "bg-black text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            Local Skills
          </button>
          <button
            onClick={() => setTab("market")}
            className={`px-4 py-2 font-medium transition-all duration-200 ${
              tab === "market"
                ? "bg-black text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            Market
          </button>
          <button
            onClick={() => setTab("ide")}
            className={`px-4 py-2 font-medium transition-all duration-200 ${
              tab === "ide"
                ? "bg-black text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            IDE Browser
          </button>
          <button
            onClick={() => setTab("project")}
            className={`px-4 py-2 font-medium transition-all duration-200 ${
              tab === "project"
                ? "bg-black text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            Projects
          </button>
          <button
            onClick={() => setTab("settings")}
            className={`px-4 py-2 font-medium transition-all duration-200 ${
              tab === "settings"
                ? "bg-black text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            Settings
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm">🌐</span>
          <span className="text-sm">⚙️</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {tab === "local" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Local Skills</h2>
              <p className="text-sm text-gray-500 mt-1">To import local skills, select the folder containing SKILL.md.</p>
              <div className="flex items-center justify-between mt-2">
                <div className="text-sm font-medium text-gray-600">
                  Total {installed.length}
                </div>
                <div className="flex items-center">
                  <Checkbox
                    onChange={(checked) => {
                      if (checked) {
                        setSelectedSkills(installed.map(skill => skill.id));
                      } else {
                        setSelectedSkills([]);
                      }
                    }}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-600">Select all</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Input
                placeholder="Search name, description or path"
                value={query}
                onChange={setQuery}
                className="w-full max-w-2xl"
                size="default"
              />
              <div className="text-sm text-gray-500 ml-4">
                Showing {installed.length} / {installed.length}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="small" icon={<Refresh size={14} />} onClick={loadInstalled}>Refresh</Button>
              <Button size="small" type="primary" icon={<Plus size={14} />} onClick={handleImportLocalSkill}>Import Local Skill</Button>
              <Button size="small" disabled={selectedSkills.length === 0} onClick={handleBatchInstall}>Batch install to IDE ({selectedSkills.length})</Button>
              <Button size="small" disabled={selectedSkills.length === 0} type="primary" status="danger" onClick={handleBatchDelete}>Delete selected ({selectedSkills.length})</Button>
              <Button size="small" type="primary" status="danger" onClick={handleDeleteAll}>Delete all</Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Spin size={40} />
              </div>
            ) : installed.length > 0 ? (
              <div className="space-y-2">
                {installed.map((skill, index) => (
                  <div
                    key={skill.id}
                    className="border border-gray-200 rounded-lg p-3 hover:border-gray-300 transition-all duration-200"
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedSkills.includes(skill.id)}
                        onChange={(checked) => handleSkillSelect(skill.id, checked!)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900">{index + 1}. {skill.name}</h3>
                        </div>
                        {Object.keys(skill.symlinks).length > 0 ? (
                          <p className="text-sm text-gray-600 mt-1">Linked to {Object.keys(skill.symlinks).join(' / ')}</p>
                        ) : (
                          <p className="text-sm text-gray-500 mt-1">Not linked</p>
                        )}
                        {skill.description && (
                          <p className="text-sm text-gray-600 mt-1">{skill.description}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">{skill.local_path}</p>
                        
                        <div className="flex flex-wrap gap-1 mt-2">
                          {IDE_OPTIONS.map((ide) => (
                            <Tag
                              key={ide.value}
                              color={skill.symlinks[ide.value] ? 'green' : 'gray'}
                              size="small"
                              className="text-xs"
                            >
                              {ide.label}
                            </Tag>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="small" type="primary" onClick={() => handleInstallToIde(skill)}>Install to IDE</Button>
                        <Button size="small" onClick={() => handleOpenFolder(skill)}>Open Folder</Button>
                        <Popconfirm
                          title="确定要删除这个技能吗？"
                          onOk={() => handleUninstall(skill.id)}
                        >
                          <Button size="small" type="primary" status="danger">Delete</Button>
                        </Popconfirm>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg p-8 text-center">
                <Empty description="暂未安装任何 Skill" />
              </div>
            )}
          </div>
        )}

        {tab === "market" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Marketplace Search</h2>
            
            <div className="flex gap-3">
              <Input
                placeholder="Search skills (name / description / author)"
                value={query}
                onChange={setQuery}
                onPressEnter={handleSearch}
                className="flex-1"
                size="default"
              />
              <Button size="small" type="primary" onClick={handleSearch}>Search</Button>
              <Button size="small" onClick={loadInstalled}>Refresh</Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Spin size={40} />
              </div>
            ) : skills.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {skills.map((skill) => (
                  <div
                    key={skill.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-all duration-200"
                  >
                    <h3 className="font-medium text-gray-900 text-lg mb-2">{skill.name}</h3>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                      <span>作者 {skill.author}</span>
                      {skill.version && <span>• v{skill.version}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                      <span>⭐ {Math.floor(Math.random() * 10000)}</span>
                      <span>↓ {Math.floor(Math.random() * 5000)}</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{skill.description}</p>
                    <div className="text-xs text-gray-500 mb-3">
                      Source: {skill.source}
                    </div>
                    {skill.repo_url && (
                      <div className="text-xs text-gray-500 mb-3 break-all">
                        {skill.repo_url}
                      </div>
                    )}
                    <Button
                      size="small"
                      type="primary"
                      loading={installing === skill.id}
                      icon={<Download size={14} />}
                      onClick={() => handleInstall(skill)}
                      disabled={!skill.repo_url}
                      className="w-full"
                    >
                      Download
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg p-8 text-center">
                <Empty description="搜索 Skills 后在此显示" />
              </div>
            )}
          </div>
        )}

        {tab === "ide" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">IDE Browser</h2>
              <div className="text-sm text-gray-600">
                {ideSkills.length} skills
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2 mb-4">
              {IDE_OPTIONS.map((ide) => (
                <Button
                  key={ide.value}
                  size="small"
                  type={platform === ide.value ? "primary" : "default"}
                  onClick={() => {
                    setPlatform(ide.value);
                    loadIdeSkills();
                  }}
                >
                  {ide.label}
                </Button>
              ))}
            </div>

            <div className="flex gap-2 mb-4">
              <Input
                placeholder="IDE name"
                className="flex-1"
                size="small"
              />
              <Input
                placeholder="e.g., myide/skills"
                className="flex-1"
                size="small"
              />
              <Button size="small" type="primary">Add IDE</Button>
            </div>

            {ideSkills.length > 0 ? (
              <div className="space-y-2">
                {ideSkills.map((skill, index) => (
                  <div
                    key={skill.id}
                    className="border border-gray-200 rounded-lg p-3 hover:border-gray-300 transition-all duration-200"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900">{index + 1}. {skill.name}</h3>
                          <span className="text-xs font-medium text-green-600">{platform} - Linked</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{skill.symlinks[platform]}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="small" onClick={() => handleOpenFolder(skill)}>Open Folder</Button>
                        <Button size="small" type="primary" status="danger" onClick={() => handleUninstall(skill.id)}>Uninstall</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg p-8 text-center">
                <Empty description={`当前 IDE (${platform}) 暂无已安装的技能`} />
              </div>
            )}
          </div>
        )}

        {tab === "project" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">Projects</h2>
              <Button size="small" type="primary">Add Project</Button>
            </div>
            <p className="text-sm text-gray-600">Configure separate Skills environments for different projects.</p>

            <div className="border border-gray-200 rounded-lg p-4">
              <div className="border border-gray-200 rounded-lg p-3 mb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">demo</h3>
                    <p className="text-xs text-gray-500">/Users/wrt/IdeaProjects/demo</p>
                    <p className="text-xs text-gray-600 mt-1">IDE Targets: 3</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      <Tag size="small" color="green">Cursor</Tag>
                      <Tag size="small" color="green">Claude Code</Tag>
                      <Tag size="small" color="green">Qoder</Tag>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="small">Deselect</Button>
                    <Button size="small">Configure</Button>
                    <Button size="small">Open Directory</Button>
                    <Button size="small" type="primary">Link Skills</Button>
                    <Button size="small" type="primary" status="danger">Remove</Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Settings</h2>
            <div className="border border-gray-200 rounded-lg p-6">
              <p className="text-sm text-gray-600">Skills Manager settings will be available here.</p>
            </div>
          </div>
        )}
      </div>

      {/* Custom IDE Modal */}
      <Modal
        title="添加自定义 IDE"
        visible={showCustomIdeModal}
        onCancel={() => setShowCustomIdeModal(false)}
        onOk={handleCreateCustomIde}
      >
        <Form>
          <Form.Item label="IDE 名称" required>
            <Input
              value={customIdeForm.name}
              onChange={(value) => setCustomIdeForm({ ...customIdeForm, name: value })}
              placeholder="例如：MyCustomIDE"
            />
          </Form.Item>
          <Form.Item label="技能路径" required>
            <Input
              value={customIdeForm.path}
              onChange={(value) => setCustomIdeForm({ ...customIdeForm, path: value })}
              placeholder="例如：/Users/username/.myide/skills"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
