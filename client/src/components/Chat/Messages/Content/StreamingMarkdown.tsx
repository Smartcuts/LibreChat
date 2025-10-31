import { useState, useEffect, useMemo, useRef } from 'react';
import { CheckCircle, Maximize2 } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { Button } from '@librechat/client';
import type { Agents } from 'librechat-data-provider';
import { useMessageContext } from '~/Providers';
import { useStreamingArtifact } from '~/hooks/useStreamingArtifact';
import { artifactsVisibility } from '~/store/artifacts';
import StreamingMarkdownRenderer from './StreamingMarkdownRenderer';
import { cn } from '~/utils';

interface StreamingMarkdownProps {
  streamingData?: Agents.ToolCall['streaming_data'];
  output?: string;
  className?: string;
  toolName?: string;
}

const ARTIFACT_THRESHOLD = 500; // Characters threshold for auto-artifact

export default function StreamingMarkdown({
  streamingData,
  output,
  className,
  toolName = 'Markdown Output',
}: StreamingMarkdownProps) {
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const artifactIdRef = useRef<string | null>(null);

  const { messageId } = useMessageContext();
  const { createArtifact, updateArtifact } = useStreamingArtifact();
  const isArtifactsVisible = useRecoilValue(artifactsVisibility);

  // Process streaming chunks into markdown text
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
            // Handle text objects
            if ('text' in chunk) {
              return (chunk as any).text;
            }
            // Handle content objects
            if ('content' in chunk) {
              return (chunk as any).content;
            }
            // Fallback to stringification
            return JSON.stringify(chunk);
          }

          return String(chunk);
        })
        .join('');

      setMarkdownContent(text);

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

      setMarkdownContent(contentToCheck);
    }
  }, [output, streamingData]);

  const progress = streamingData?.progress || 0;
  const isComplete = streamingData?.isComplete || false;
  const chunkCount = streamingData?.chunks.length || 0;

  // Reset artifact state when panel closes
  useEffect(() => {
    if (!isArtifactsVisible && artifactIdRef.current) {
      artifactIdRef.current = null;
    }
  }, [isArtifactsVisible]);

  // Handle artifact creation for long content
  const handleViewAsArtifact = () => {
    if (markdownContent.length > 0) {
      const artifact = createArtifact({
        type: 'text/markdown',
        title: toolName,
        content: markdownContent,
        messageId,
      });
      artifactIdRef.current = artifact.id;
    }
  };

  // Check if artifact is created and panel is open
  const isArtifactActive = artifactIdRef.current && isArtifactsVisible;

  // Check if we should show the "View as Artifact" button
  const shouldShowArtifactButton = markdownContent.length > ARTIFACT_THRESHOLD;

  if (!markdownContent && !streamingData) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header with controls */}
      {(shouldShowArtifactButton || !isComplete) && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!isComplete && progress > 0 && (
              <span className="text-xs text-text-secondary">
                Streaming markdown: {progress.toFixed(0)}%
              </span>
            )}
            {isComplete && (
              <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <CheckCircle className="h-3 w-3" />
                Complete
              </div>
            )}
          </div>
          {shouldShowArtifactButton && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleViewAsArtifact}
              className="gap-1"
              disabled={!!isArtifactActive}
            >
              <Maximize2 className="h-3 w-3" />
              {isArtifactActive ? 'Viewing in Artifact' : 'View as Artifact'}
            </Button>
          )}
        </div>
      )}

      {/* Markdown Content */}
      <div className="rounded-lg border border-border-light bg-surface-tertiary">
        <div className="max-h-96 overflow-auto p-3 md:p-4">
          {markdownContent ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <StreamingMarkdownRenderer content={markdownContent} />
            </div>
          ) : (
            <span className="text-sm text-text-tertiary">Waiting for markdown data...</span>
          )}
        </div>
      </div>

      {/* Statistics */}
      {isComplete && chunkCount > 0 && (
        <div className="text-xs text-text-tertiary">
          {chunkCount} chunks • {markdownContent.length} characters
        </div>
      )}
    </div>
  );
}
