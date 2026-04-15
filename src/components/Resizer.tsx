import { useState, useEffect, useRef } from "react";

interface ResizerProps {
  direction: "horizontal" | "vertical";
  onResize: (delta: number) => void;
  className?: string;
}

export const Resizer: React.FC<ResizerProps> = ({ direction, onResize, className = "" }) => {
  const [isResizing, setIsResizing] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      if (direction === "horizontal") {
        const delta = e.clientX - startX.current;
        onResize(delta);
        startX.current = e.clientX;
      } else {
        const delta = e.clientY - startY.current;
        onResize(delta);
        startY.current = e.clientY;
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, direction, onResize]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startX.current = e.clientX;
    startY.current = e.clientY;
  };

  return (
    <div
      className={`
        ${className}
        ${direction === "horizontal" ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"}
        bg-gray-300 hover:bg-gray-400 transition-colors
        select-none
      `}
      onMouseDown={handleMouseDown}
    />
  );
};
