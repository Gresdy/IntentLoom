import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";

// 动态导入invoke函数
const invoke = async (command: string, args?: any) => {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke(command, args);
};
import { LeftPanel } from "../components/LeftPanel";
import { SkillsView } from "../components/skills/SkillsView";
import { FileTree } from "../components/FileTree";
import { CenterPanel } from "../components/CenterPanel";
import { RightPanel } from "../components/RightPanel";
import { Resizer } from "../components/Resizer";
import type { Project } from "../shared/types";

export const Home: React.FC = () => {
  const [showFileTree, setShowFileTree] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [filePath, setFilePath] = useState("");
  const [leftPanelWidth, setLeftPanelWidth] = useState(200);
  const [rightPanelWidth, setRightPanelWidth] = useState(400);
  const [fileTreeWidth, setFileTreeWidth] = useState(240);
  const [activeKey, setActiveKey] = useState("model");

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      await invoke("list_projects");
    } catch (err) {
      console.error("Failed to load projects:", err);
    }
  };

  const handleOpenProject = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
    });

    if (selected) {
      const project = await invoke("add_project", { path: selected });
      setSelectedProject(project as any);
      setShowFileTree(true);
    }
  };

  const handleFileSelect = async (path: string) => {
    try {
      const content = await invoke("read_file", { filePath: path });
      setFilePath(path);
      setFileContent(content as string);
    } catch (err) {
      console.error("Failed to read file:", err);
    }
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden">
      {/* Left Panel */}
      <LeftPanel 
        width={leftPanelWidth} 
        activeKey={activeKey}
        onActiveKeyChange={setActiveKey}
      />
      
      {/* Resizer between Left Panel and File Tree */}
      <Resizer 
        direction="horizontal" 
        onResize={(delta) => setLeftPanelWidth(prev => Math.max(100, Math.min(400, prev + delta)))} 
        className="h-full"
      />

      {/* File Tree - Conditional */}
      {showFileTree && selectedProject && (
        <div style={{ width: `${fileTreeWidth}px` }}>
          <FileTree
            projectPath={selectedProject.path}
            onFileSelect={handleFileSelect}
          />
        </div>
      )}
      
      {/* Resizer between File Tree and Center Panel */}
      {showFileTree && selectedProject && (
        <Resizer 
          direction="horizontal" 
          onResize={(delta) => setFileTreeWidth(prev => Math.max(150, Math.min(500, prev + delta)))} 
          className="h-full"
        />
      )}

      {/* Center Panel */}
      <div className="flex-1">
        {activeKey === "skills" ? (
          <SkillsView />
        ) : (
          <CenterPanel
            fileContent={fileContent}
            filePath={filePath}
            onContentChange={setFileContent}
          />
        )}
      </div>

      {/* Right Panel */}
      <div style={{ width: `${rightPanelWidth}px` }}>
        <RightPanel />
      </div>
      
      {/* Resizer between Center Panel and Right Panel */}
      <Resizer 
        direction="horizontal" 
        onResize={(delta) => setRightPanelWidth(prev => Math.max(200, Math.min(600, prev - delta)))} 
        className="h-full"
      />

      {/* Hidden button for opening project - to be triggered by UI */}
      <button onClick={handleOpenProject} className="hidden" id="open-project-btn" />
    </div>
  );
};
