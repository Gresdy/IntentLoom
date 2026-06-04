import { useState, useEffect } from "react";
import { useProjectStore } from "../../stores/useProjectStore";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "../../lib/tauri";
import { ChevronDown, ChevronLeft, ChevronRight, FileText, FolderOpen, Plus, SkipForward } from "lucide-react";

type FileNode = {
  name: string;
  path: string;
  file_type: "file" | "directory";
};

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  onFileSelect: (path: string) => void;
  selectedFile: string;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, depth, onFileSelect, selectedFile }) => {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);

  const loadChildren = async () => {
    if (node.file_type === "directory") {
      setLoading(true);
      try {
        const kids = await invoke("read_dir", { dirPath: node.path });
        setChildren(kids as FileNode[]);
      } catch (err) {
        console.error("Failed to load directory:", err);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleClick = () => {
    if (node.file_type === "directory") {
      setExpanded(!expanded);
      if (!expanded) loadChildren();
    } else {
      onFileSelect(node.path);
    }
  };

  const isSelected = selectedFile === node.path;

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1 px-2 cursor-pointer hover:bg-gray-100 rounded ${
          isSelected ? "bg-indigo-100" : ""
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
      >
        <span className="text-gray-500 w-4">
          {node.file_type === "directory" ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
        </span>
        <span className={`text-sm ${node.file_type === "directory" ? "font-medium" : "text-gray-600"}`}>
          {node.name}
        </span>
        {loading && <span className="ml-2 text-xs text-gray-400">加载中...</span>}
      </div>
      {expanded && children.map((child) => (
        <TreeNode key={child.path} node={child} depth={depth + 1} onFileSelect={onFileSelect} selectedFile={selectedFile} />
      ))}
    </div>
  );
};

export const ProjectsPanel: React.FC = () => {
  const { projects, addProject, loadProjects } = useProjectStore();

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [fileContent, setFileContent] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(true);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  useEffect(() => {
    const fetchProjects = async () => {
      setProjectsLoading(true);
      await loadProjects();
      setProjectsLoading(false);
    };
    
    fetchProjects();
  }, []);

  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects]);

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectFiles(selectedProjectId);
    }
  }, [selectedProjectId]);

  const loadProjectFiles = async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      setLoading(true);
      try {
        const files = await invoke("read_dir", { dirPath: project.path });
        setFileTree(files as FileNode[]);
      } catch (err) {
        console.error("Failed to load project files:", err);
        setFileTree([]);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleAddProject = async () => {
    try {
      setLoading(true);
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择项目文件夹",
      });

      if (selected && typeof selected === "string") {
        const parts = selected.split(/[\\/]/).filter(Boolean);
        const name = parts[parts.length - 1] || "未命名项目";
        await addProject(selected, name, []);
        setSelectedProjectId(name);
      }
    } catch (err) {
      console.error("Failed to add project:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (path: string) => {
    setSelectedFile(path);
    setContentLoading(true);
    try {
      const content = await invoke<string>("read_file", { filePath: path });
      setFileContent(content || "");
      const parts = path.split(/[\\/]/);
      setFileName(parts[parts.length - 1] || path);
    } catch (err) {
      console.error("Failed to read file:", err);
      setFileContent(`错误: 无法读取文件`);
    } finally {
      setContentLoading(false);
    }
  };

  const handlePreviewToggle = () => {
    setShowPreview(!showPreview);
  };

  return (
    <div className="h-full flex bg-white">
      {/* Left: Project Tree */}
      <div className="flex flex-col" style={{ width: showPreview ? "40%" : "100%" }}>
        {/* Header with Dropdown */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              disabled={projectsLoading}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">{projectsLoading ? "加载项目中..." : "选择项目..."}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleAddProject}
              disabled={loading || projectsLoading}
              className="flex items-center gap-1 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <Plus size={16} />
              添加
            </button>
            {selectedFile && (
              <button
                onClick={handlePreviewToggle}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                title={showPreview ? "隐藏预览" : "显示预览"}
              >
                {showPreview ? <SkipForward size={20} /> : <ChevronLeft size={20} />}
              </button>
            )}
          </div>
          {selectedProject && (
            <p className="text-xs text-gray-500 mt-2 truncate">{selectedProject.path}</p>
          )}
        </div>

        {/* File Tree */}
        <div className="flex-1 overflow-y-auto">
          {!selectedProjectId ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <FolderOpen size={48} />
              <p className="mt-3 text-sm">请选择一个项目</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <p className="text-sm">加载中...</p>
            </div>
          ) : fileTree.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <FolderOpen size={48} />
              <p className="mt-3 text-sm">项目目录为空</p>
            </div>
          ) : (
            <div className="p-2">
              {fileTree.map((node) => (
                <TreeNode key={node.path} node={node} depth={0} onFileSelect={handleFileSelect} selectedFile={selectedFile} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: File Preview */}
      {showPreview && selectedFile && (
        <div className="flex-1 border-l border-gray-200 flex flex-col bg-gray-50">
          {/* File Header */}
          <div className="p-3 border-b border-gray-200 bg-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-gray-500" />
              <span className="font-medium text-gray-800">{fileName}</span>
            </div>
            <button
              onClick={() => {
                setShowPreview(false);
                setSelectedFile("");
              }}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            >
              ✕
            </button>
          </div>

          {/* File Content */}
          <div className="flex-1 overflow-auto p-4">
            {contentLoading ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <p className="text-sm">加载文件中...</p>
              </div>
            ) : (
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                {fileContent}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectsPanel;
