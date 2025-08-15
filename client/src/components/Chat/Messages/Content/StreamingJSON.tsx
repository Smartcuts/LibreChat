import { useState, useEffect } from 'react';
import { CheckCircle } from 'lucide-react';
import type { Agents } from 'librechat-data-provider';
import { cn } from '~/utils';

interface StreamingJSONProps {
  streamingData?: Agents.ToolCall['streaming_data'];
  output?: string;
  className?: string;
}

export default function StreamingJSON({ streamingData, output, className }: StreamingJSONProps) {
  const [jsonData, setJsonData] = useState<any[]>([]);
  const [combinedJSON, setCombinedJSON] = useState<any>(null);

  // Process streaming chunks into JSON objects
  useEffect(() => {
    if (streamingData) {
      const { chunks, isComplete } = streamingData;

      const jsonObjects = chunks
        .filter((chunkEntry) => chunkEntry && chunkEntry.data !== undefined)
        .map((chunkEntry) => {
          const chunk = chunkEntry.data;

          // Parse JSON if it's a string
          if (typeof chunk === 'string') {
            try {
              return JSON.parse(chunk);
            } catch {
              return chunk;
            }
          }

          return chunk;
        });

      setJsonData(jsonObjects);

      // If complete, try to combine into a single JSON structure
      if (isComplete && jsonObjects.length > 0) {
        // Check if it's an array of objects that should be combined
        if (jsonObjects.every((obj) => typeof obj === 'object' && !Array.isArray(obj))) {
          // Merge objects
          const merged = Object.assign({}, ...jsonObjects);
          setCombinedJSON(merged);
        } else {
          // Keep as array
          setCombinedJSON(jsonObjects);
        }
      }
    }
  }, [streamingData]);

  // Parse output if no streaming data
  useEffect(() => {
    if (!streamingData && output) {
      try {
        const parsed = JSON.parse(output);
        setCombinedJSON(parsed);
      } catch {
        // Not valid JSON, ignore
      }
    }
  }, [output, streamingData]);

  const progress = streamingData?.progress || 0;
  const isComplete = streamingData?.isComplete || false;
  const chunkCount = streamingData?.chunks.length || 0;

  if (!jsonData.length && !combinedJSON) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Progress indicator */}
      {!isComplete && progress > 0 && (
        <div className="text-xs text-text-secondary">
          Processing JSON: {progress.toFixed(0)}% ({chunkCount} chunks)
        </div>
      )}

      {/* JSON Display */}
      <div className="rounded-lg border border-border-light bg-surface-tertiary">
        <div className="border-b border-border-light px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">JSON Data</span>
            {isComplete && (
              <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <CheckCircle className="h-3 w-3" />
                Complete
              </div>
            )}
          </div>
        </div>
        <div className="max-h-96 overflow-auto p-3">
          <pre className="text-xs text-text-primary">
            <code>
              {combinedJSON
                ? JSON.stringify(combinedJSON, null, 2)
                : jsonData.map((item, idx) => (
                    <div key={idx} className="mb-2">
                      {JSON.stringify(item, null, 2)}
                    </div>
                  ))}
            </code>
          </pre>
        </div>
      </div>

      {/* Summary for completed state */}
      {isComplete && (
        <div className="text-xs text-text-tertiary">
          Received {chunkCount} JSON chunks
          {combinedJSON && Array.isArray(combinedJSON) && ` • ${combinedJSON.length} items`}
        </div>
      )}
    </div>
  );
}
