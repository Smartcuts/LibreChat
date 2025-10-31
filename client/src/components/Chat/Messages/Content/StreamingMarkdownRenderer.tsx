import React, { memo, useMemo } from 'react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import supersub from 'remark-supersub';
import rehypeKatex from 'rehype-katex';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import type { Pluggable } from 'unified';
import { CodeBlockProvider } from '~/Providers';
import MarkdownErrorBoundary from './MarkdownErrorBoundary';
import { langSubset } from '~/utils';
import { code, a, p } from './MarkdownComponents';

/**
 * StreamingMarkdownRenderer
 *
 * A safe markdown renderer for tool outputs that excludes raw HTML support.
 * This prevents potential security issues and layout problems from arbitrary HTML
 * in tool responses while maintaining full markdown feature support.
 *
 * Features:
 * - ✓ GitHub Flavored Markdown (tables, strikethrough, task lists)
 * - ✓ Math rendering (KaTeX)
 * - ✓ Syntax highlighting for code blocks
 * - ✓ Superscript/subscript
 * - ✓ Links, images, emphasis, lists
 * - ✗ Raw HTML (intentionally disabled for security)
 *
 * Differences from regular Markdown component:
 * - No rehypeRaw plugin (HTML is escaped as text)
 * - No artifact support (tools already render in artifact context)
 * - No citation support (tool-specific)
 * - Simplified for tool output use case
 */

interface StreamingMarkdownRendererProps {
  content: string;
}

const StreamingMarkdownRenderer = memo(({ content }: StreamingMarkdownRendererProps) => {
  const rehypePlugins = useMemo(
    () => [
      [rehypeKatex],
      [
        rehypeHighlight,
        {
          detect: true,
          ignoreMissing: true,
          subset: langSubset,
        },
      ],
      // NOTE: rehypeRaw is intentionally excluded
      // This means raw HTML in markdown will be escaped as text for security
    ],
    [],
  );

  const remarkPlugins: Pluggable[] = [
    supersub, // Support for ^superscript^ and ~subscript~
    remarkGfm, // GitHub Flavored Markdown (includes table support)
    [remarkMath, { singleDollarTextMath: false }], // Math equations with $$
  ];

  if (!content) {
    return null;
  }

  return (
    <MarkdownErrorBoundary content={content} codeExecution={false}>
      <CodeBlockProvider>
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          components={
            {
              code, // Custom code block rendering with syntax highlighting
              a, // Custom link rendering
              p, // Custom paragraph rendering
            } as {
              [nodeType: string]: React.ElementType;
            }
          }
        >
          {content}
        </ReactMarkdown>
      </CodeBlockProvider>
    </MarkdownErrorBoundary>
  );
});

StreamingMarkdownRenderer.displayName = 'StreamingMarkdownRenderer';

export default StreamingMarkdownRenderer;
