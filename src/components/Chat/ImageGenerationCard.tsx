/**
 * ImageGenerationCard — AionUi `ImageDisplay` port.
 *
 * Originally from
 *   packages/desktop/src/renderer/pages/conversation/Messages/components/MessageToolGroup.tsx → ImageDisplay
 *
 * Renders an image generation result with three states (loading /
 * error / loaded) and two inline actions (copy to clipboard +
 * download). The source URL can be either a remote `http(s)` URL
 * (loaded directly) or a local file path (loaded via a Tauri
 * `readImageAsBase64` IPC). The component intentionally does NOT
 * know about Tauri specifics — the parent supplies a `loadImage`
 * resolver that returns a `data:` URL, so the same component can
 * be used in both desktop and pure-web contexts.
 */

import { useEffect, useState } from "react";
import { Loader2, Copy, Download, ImageOff } from "lucide-react";

export type ImageLoadFn = (src: string) => Promise<string>;

export interface ImageGenerationCardProps {
  src: string;
  alt?: string;
  /** Optional display name for the download filename. */
  fileName?: string;
  /** Resolver that turns a non-URL `src` into a `data:` URL. */
  loadImage?: ImageLoadFn;
  onCopy?: (src: string) => void | Promise<void>;
  onDownload?: (src: string, fileName: string) => void | Promise<void>;
}

const isDataOrHttp = (s: string): boolean =>
  s.startsWith("data:") || s.startsWith("http://") || s.startsWith("https://");

const defaultLoad: ImageLoadFn = async (src) => {
  // Browser-only fallback: assume it's already a URL. If it isn't
  // the <img> will fail and the error state will render.
  return src;
};

export function ImageGenerationCard({
  src,
  alt,
  fileName,
  loadImage = defaultLoad,
  onCopy,
  onDownload,
}: ImageGenerationCardProps) {
  const [resolved, setResolved] = useState<string>(() => (isDataOrHttp(src) ? src : ""));
  const [loading, setLoading] = useState<boolean>(!isDataOrHttp(src));
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    if (isDataOrHttp(src)) {
      setResolved(src);
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    loadImage(src)
      .then((url) => {
        if (cancelled) return;
        setResolved(url);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [src, loadImage]);

  const handleCopy = () => {
    if (onCopy) return void onCopy(resolved || src);
    if (!resolved) return;
    // Default copy: try clipboard API; ignore failures (e.g. outside secure context).
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(resolved);
    }
  };

  const handleDownload = () => {
    const name = fileName ?? (alt || "image").replace(/[\\/:*?"<>|]+/g, "_");
    if (onDownload) return void onDownload(resolved || src, name);
    if (!resolved) return;
    const a = document.createElement("a");
    a.href = resolved;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (loading) {
    return (
      <div className="image-generation image-generation--loading" data-testid="image-generation-loading" role="status">
        <Loader2 size={14} className="spin" />
        <span>加载图片…</span>
      </div>
    );
  }
  if (error || !resolved) {
    return (
      <div className="image-generation image-generation--error" data-testid="image-generation-error" role="alert">
        <ImageOff size={14} />
        <span>图片加载失败</span>
      </div>
    );
  }

  return (
    <div className="image-generation" data-testid="image-generation">
      <img
        src={resolved}
        alt={alt ?? "Generated image"}
        className="image-generation__img"
        loading="lazy"
        onError={() => setError(true)}
      />
      <div className="image-generation__actions">
        <button
          type="button"
          className="image-generation__btn"
          onClick={handleCopy}
          aria-label="复制图片地址"
          data-testid="image-generation-copy"
        >
          <Copy size={12} />
        </button>
        <button
          type="button"
          className="image-generation__btn"
          onClick={handleDownload}
          aria-label="下载图片"
          data-testid="image-generation-download"
        >
          <Download size={12} />
        </button>
      </div>
    </div>
  );
}

export default ImageGenerationCard;
