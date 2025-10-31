import { useState, useEffect, useMemo, useRef } from 'react';
import { CheckCircle, Maximize2, AlertTriangle } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { Button } from '@librechat/client';
import type { Agents } from 'librechat-data-provider';
import { useMessageContext } from '~/Providers';
import { useStreamingArtifact } from '~/hooks/useStreamingArtifact';
import { artifactsVisibility } from '~/store/artifacts';
import Markdown from './Markdown';
import { cn } from '~/utils';

interface StreamingHTMLProps {
  streamingData?: Agents.ToolCall['streaming_data'];
  output?: string;
  className?: string;
  toolName?: string;
}

const ARTIFACT_THRESHOLD = 300; // Characters threshold for auto-artifact (lower for HTML)

/**
 * StreamingHTML component for rendering HTML content from tool calls
 *
 * Rendering Strategy:
 * - Short HTML (<300 chars): Inline rendering via Markdown component with rehype-raw
 * - Long HTML (>300 chars): Artifact-based rendering with Sandpack preview
 *
 * Security:
 * - Uses ReactMarkdown with rehype-raw which sanitizes dangerous HTML
 * - Complex/long HTML rendered in sandboxed iframe via artifacts
 */
export default function StreamingHTML({
  streamingData,
  output,
  className,
  toolName = 'HTML Output',
}: StreamingHTMLProps) {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [showInline, setShowInline] = useState<boolean>(false);
  const artifactIdRef = useRef<string | null>(null);

  const { messageId } = useMessageContext();
  const { createArtifact, updateArtifact } = useStreamingArtifact();
  const isArtifactsVisible = useRecoilValue(artifactsVisibility);

  // Process streaming chunks into HTML text
  useEffect(() => {
    if (streamingData) {
      const { chunks } = streamingData;

      // Combine all chunks into text
      const text = chunks
        .filter((chunkEntry) => chunkEntry && chunkEntry.data !== undefined)
        .map((chunkEntry) => {
          const chunk = chunkEntry.data;

          if (typeof chunk === 'string') {
            return chunk;
          }

          if (typeof chunk === 'object' && chunk !== null) {
            // Handle text/content objects
            if ('text' in chunk) {
              return (chunk as any).text;
            }
            if ('content' in chunk) {
              return (chunk as any).content;
            }
            if ('html' in chunk) {
              return (chunk as any).html;
            }
            // Fallback to stringification
            return JSON.stringify(chunk);
          }

          return String(chunk);
        })
        .join('');

      setHtmlContent(text);

      // Update artifact if it exists
      if (artifactIdRef.current && isArtifactsVisible) {
        updateArtifact(artifactIdRef.current, {
          content: text,
        });
      }
    }
  }, [streamingData, updateArtifact, isArtifactsVisible]);

  // Use output if no streaming data
  useEffect(() => {
    if (!streamingData && output) {
      // Handle structured output format from Anthropic models: [{"type": "text", "text": "..."}]
      let contentToCheck = output;
      try {
        const parsed = JSON.parse(output);
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed[0]?.type === 'text' &&
          parsed[0]?.text
        ) {
          contentToCheck = parsed[0].text;
        }
      } catch {
        contentToCheck = output;
      }

      setHtmlContent(contentToCheck);
    }
  }, [output, streamingData]);

  const progress = streamingData?.progress || 0;
  const isComplete = streamingData?.isComplete || false;
  const chunkCount = streamingData?.chunks.length || 0;

  // Determine if content is short enough for inline rendering
  const isShortContent = useMemo(() => {
    return htmlContent.length > 0 && htmlContent.length <= ARTIFACT_THRESHOLD;
  }, [htmlContent]);

  // Reset artifact state when panel closes
  useEffect(() => {
    if (!isArtifactsVisible && artifactIdRef.current) {
      artifactIdRef.current = null;
    }
  }, [isArtifactsVisible]);

  // Handle artifact creation
  const handleViewAsArtifact = () => {
    if (htmlContent.length > 0) {
      const artifact = createArtifact({
        type: 'text/html',
        title: toolName,
        content: htmlContent,
        messageId,
      });
      artifactIdRef.current = artifact.id;
    }
  };

  // Auto-create artifact for long content when complete
  useEffect(() => {
    if (isComplete && htmlContent.length > ARTIFACT_THRESHOLD && !artifactIdRef.current) {
      // Auto-create artifact for long HTML
      handleViewAsArtifact();
    }
  }, [isComplete, htmlContent.length]);

  // Check if artifact is created and panel is open
  const isArtifactActive = artifactIdRef.current && isArtifactsVisible;

  if (!htmlContent && !streamingData) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!isComplete && progress > 0 && (
            <span className="text-xs text-text-secondary">
              Streaming HTML: {progress.toFixed(0)}%
            </span>
          )}
          {isComplete && (
            <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <CheckCircle className="h-3 w-3" />
              Complete
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isShortContent && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowInline(!showInline)}
              className="gap-1 text-xs"
            >
              {showInline ? 'Hide Preview' : 'Show Preview'}
            </Button>
          )}
          {htmlContent.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleViewAsArtifact}
              className="gap-1"
              disabled={!!isArtifactActive}
            >
              <Maximize2 className="h-3 w-3" />
              {isArtifactActive ? 'Viewing in Artifact' : 'View in Artifact'}
            </Button>
          )}
        </div>
      </div>

      {/* Info message for long content */}
      {!isShortContent && htmlContent.length > 0 && !isArtifactActive && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            <div className="font-medium text-text-primary">Large HTML Content</div>
            <div className="mt-1 text-xs text-text-secondary">
              This HTML content is best viewed in the Artifact panel for full interactivity and
              safe sandboxed execution.
            </div>
          </div>
        </div>
      )}

      {/* Inline preview for short HTML */}
      {isShortContent && showInline && htmlContent && (
        <div className="rounded-lg border border-border-light bg-surface-tertiary">
          <div className="border-b border-border-light px-3 py-2">
            <span className="text-xs font-medium text-text-secondary">HTML Preview</span>
          </div>
          <div className="max-h-96 overflow-auto p-3 md:p-4">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {/* Markdown component handles HTML via rehype-raw plugin */}
              <Markdown content={htmlContent} isLatestMessage={false} />
            </div>
          </div>
        </div>
      )}

      {/* Raw HTML view */}
      {!showInline && htmlContent && (
        <div className="rounded-lg border border-border-light bg-surface-tertiary">
          <div className="border-b border-border-light px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">HTML Source</span>
              {isComplete && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(htmlContent);
                  }}
                  className="h-auto px-2 py-1 text-xs"
                >
                  Copy
                </Button>
              )}
            </div>
          </div>
          <div className="max-h-96 overflow-auto p-3 md:p-4">
            <pre className="text-xs text-text-primary">
              <code className="language-html">{htmlContent}</code>
            </pre>
          </div>
        </div>
      )}

      {/* Statistics */}
      {isComplete && chunkCount > 0 && (
        <div className="text-xs text-text-tertiary">
          {chunkCount} chunks • {htmlContent.length} characters
        </div>
      )}
    </div>
  );
}
