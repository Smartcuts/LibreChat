import { useState, useEffect } from 'react';
import { CheckCircle } from 'lucide-react';
import type { Agents } from 'librechat-data-provider';
import { cn } from '~/utils';

interface StreamingTextProps {
  streamingData?: Agents.ToolCall['streaming_data'];
  output?: string;
  className?: string;
}

export default function StreamingText({ streamingData, output, className }: StreamingTextProps) {
  const [textContent, setTextContent] = useState<string>('');

  // Process streaming chunks into text
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

      setTextContent(text);
    }
  }, [streamingData]);

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

      setTextContent(contentToCheck);
    }
  }, [output, streamingData]);

  const progress = streamingData?.progress || 0;
  const isComplete = streamingData?.isComplete || false;
  const chunkCount = streamingData?.chunks.length || 0;

  if (!textContent && !streamingData) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Text Display */}
      <div className="rounded-lg border border-border-light bg-surface-tertiary">
        <div className="border-b border-border-light px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">
              Text Output
              {!isComplete && progress > 0 && (
                <span className="ml-2 text-text-tertiary">({progress.toFixed(0)}%)</span>
              )}
            </span>
            {isComplete && (
              <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <CheckCircle className="h-3 w-3" />
                Complete
              </div>
            )}
          </div>
        </div>
        <div className="max-h-96 overflow-auto p-4">
          <div className="whitespace-pre-wrap text-sm text-text-primary">
            {textContent || <span className="text-text-tertiary">Waiting for data...</span>}
          </div>
        </div>
      </div>

      {/* Statistics */}
      {isComplete && chunkCount > 0 && (
        <div className="text-xs text-text-tertiary">
          {chunkCount} chunks • {textContent.length} characters
        </div>
      )}
    </div>
  );
}
