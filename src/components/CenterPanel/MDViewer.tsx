import { useRef } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

interface MDViewerProps {
  content: string;
  onChange: (content: string) => void;
  language?: string;
}

function getLanguage(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    md: "markdown",
    py: "python",
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    go: "go",
    rs: "rust",
    java: "java",
    cpp: "cpp",
    c: "c",
    html: "html",
    css: "css",
  };
  return map[ext] || "plaintext";
}

export const MDViewer: React.FC<MDViewerProps> = ({
  content,
  onChange,
  language,
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  return (
    <div className="h-full">
      <Editor
        height="100%"
        language={language || "markdown"}
        value={content}
        onChange={(value) => onChange(value || "")}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: "off",
          wordWrap: "on",
          scrollBeyondLastLine: false,
          renderWhitespace: "none",
          padding: { top: 16 },
        }}
        theme="vs"
      />
    </div>
  );
};

export { getLanguage };
