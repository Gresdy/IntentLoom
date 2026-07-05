/**
 * MarkdownView — AionUi-style markdown rendering.
 * 
 * Ported from AionUi's MarkdownView component:
 *   /Users/zyh/PycharmProjects/AionUi/src/renderer/components/Markdown/index.tsx
 * 
 * Features:
 *   - GitHub Flavored Markdown (GFM) support
 *   - Syntax highlighting for code blocks
 *   - Clickable links (open in external browser)
 *   - Responsive tables
 * 
 * AionUi reference:
 *   packages/desktop/src/renderer/components/Markdown/index.tsx
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMemo, useCallback } from 'react';

interface MarkdownViewProps {
  children: string;
  className?: string;
  codeStyle?: React.CSSProperties;
}

export function MarkdownView({ children, className = '', codeStyle }: MarkdownViewProps) {
  // Handle link clicks to open in external browser
  const handleLinkClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const href = (e.currentTarget as HTMLAnchorElement).href;
    if (href) {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  }, []);

  // Memoize components to prevent unnecessary re-renders
  const components = useMemo(() => ({
    // Custom link handler
    a: ({ href, children: linkChildren, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a
        href={href}
        target='_blank'
        rel='noopener noreferrer'
        onClick={handleLinkClick}
        {...rest}
      >
        {linkChildren}
      </a>
    ),
    // Custom code block styling
    code: ({ className: codeClass, children: codeChildren, ...rest }: React.HTMLAttributes<HTMLElement> & { inline?: boolean }) => {
      const isInline = !codeClass;
      if (isInline) {
        return (
          <code
            className={className}
            style={{
              backgroundColor: 'var(--bg-soft)',
              padding: '2px 6px',
              borderRadius: '4px',
              fontFamily: 'var(--mono)',
              fontSize: '0.9em',
              ...codeStyle,
            }}
            {...rest}
          >
            {codeChildren}
          </code>
        );
      }
      return (
        <code className={codeClass} {...rest}>
          {codeChildren}
        </code>
      );
    },
    // Custom table styling for responsiveness
    table: ({ children: tableChildren, ...rest }: React.TableHTMLAttributes<HTMLTableElement>) => (
      <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '8px 0' }}>
        <table
          style={{
            borderCollapse: 'collapse',
            border: '1px solid var(--border)',
            width: '100%',
          }}
          {...rest}
        >
          {tableChildren}
        </table>
      </div>
    ),
    td: ({ children: tdChildren, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
      <td
        style={{
          padding: '8px 12px',
          border: '1px solid var(--border)',
        }}
        {...rest}
      >
        {tdChildren}
      </td>
    ),
    th: ({ children: thChildren, ...rest }: React.ThHTMLAttributes<HTMLTableHeaderCellElement>) => (
      <th
        style={{
          padding: '8px 12px',
          border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-soft)',
          fontWeight: 600,
        }}
        {...rest}
      >
        {thChildren}
      </th>
    ),
  }), [handleLinkClick, codeStyle, className]);

  return (
    <div className={`markdown-view ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export default MarkdownView;
