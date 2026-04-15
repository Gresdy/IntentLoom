import { useState, useEffect } from "react";
import { Folder, FolderOpen, FileText, Right, Down } from "@icon-park/react";
import type { FileNode } from "../../shared/types";

// 动态导入invoke函数
const invoke = async (command: string, args?: any) => {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke(command, args);
};

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  onFileSelect: (path: string) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, depth, onFileSelect }) => {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileNode[]>([]);

  const loadChildren = async () => {
    if (node.file_type === "directory") {
      const kids = await invoke("read_dir", { dirPath: node.path });
      setChildren(kids as FileNode[]);
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

  const getIcon = () => {
    if (node.file_type === "directory") {
      return expanded ? <FolderOpen size={14} /> : <Folder size={14} />;
    }
    return <FileText size={14} />;
  };

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1 px-2 cursor-pointer hover:bg-gray-100 rounded"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
      >
        {node.file_type === "directory" && (
          <span className="text-gray-400">
            {expanded ? <Down size={12} /> : <Right size={12} />}
          </span>
        )}
        {getIcon()}
        <span className="text-sm truncate">{node.name}</span>
      </div>
      {expanded &&
        children.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            onFileSelect={onFileSelect}
          />
        ))}
    </div>
  );
};

interface FileTreeProps {
  projectPath: string;
  onFileSelect: (path: string) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({ projectPath, onFileSelect }) => {
  const [rootNodes, setRootNodes] = useState<FileNode[]>([]);

  useEffect(() => {
    if (projectPath) {
      invoke("read_dir", { dirPath: projectPath }).then((result) => setRootNodes(result as FileNode[]));
    }
  }, [projectPath]);

  return (
    <div className="h-full w-[240px] border-r border-gray-200 bg-white overflow-auto">
      <div className="p-2 text-xs text-gray-500 border-b border-gray-100">
        文件树
      </div>
      <div className="py-1">
        {rootNodes.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            onFileSelect={onFileSelect}
          />
        ))}
      </div>
    </div>
  );
};
