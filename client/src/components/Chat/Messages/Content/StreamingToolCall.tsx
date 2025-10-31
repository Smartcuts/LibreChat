import { useMemo, useState } from 'react';
import { Button } from '@librechat/client';
import { Database, ChevronDown, ChevronUp, FileText, Code, AlignLeft } from 'lucide-react';
import type { TAttachment, Agents } from 'librechat-data-provider';
import { useLocalize, useProgress } from '~/hooks';
import { AttachmentGroup } from './Parts';
import ToolCallInfo from './ToolCallInfo';
import ProgressText from './ProgressText';
import StreamingCSV from './StreamingCSV';
import StreamingJSON from './StreamingJSON';
import StreamingText from './StreamingText';

export default function StreamingToolCall({
  initialProgress = 0.1,
  name,
  args: _args = '',
  output,
  attachments,
  onComplete,
  streamingData: propStreamingData,
  error = false,
}: {
  initialProgress: number;
  isSubmitting: boolean;
  // tool name
  name: string;
  // tool args
  args: string | Record<string, unknown>;
  // tool output
  output?: string;
  attachments?: TAttachment[];
  onComplete?: (data: any) => void;
  // streaming data from tool result deltas
  streamingData?: Agents.ToolCall['streaming_data'];
  // whether the tool call failed
  error?: boolean;
}) {
  const localize = useLocalize();
  const [showInfo, setShowInfo] = useState(false);
  const progress = useProgress(initialProgress);

  // stringified args
  const args = useMemo(() => {
    if (typeof _args === 'string') {
      return _args;
    }
    try {
      return JSON.stringify(_args, null, 2);
    } catch {
      return '';
    }
  }, [_args]) as string;

  // Determine which streaming component to render based on mimeType or output
  const renderStreamingContent = () => {
    // Determine the mimeType from streaming data or try to infer from output
    let mimeType = propStreamingData?.mimeType;

    // If no streaming data but we have output, try to infer the type
    if (!mimeType && output) {
      // First, handle structured output format from Anthropic models: [{"type": "text", "text": "..."}]
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

      try {
        const parsed = JSON.parse(contentToCheck);
        // Check if it looks like CSV data
        if (
          parsed.csv_data ||
          parsed.file?.filename?.endsWith('.csv') ||
          parsed.mimeType === 'text/csv'
        ) {
          mimeType = 'text/csv';
        } else {
          mimeType = 'application/json';
        }
      } catch {
        // Check if it's raw CSV data (starts with headers and has comma-separated values)
        if (contentToCheck && typeof contentToCheck === 'string') {
          const lines = contentToCheck.split('\n');
          if (lines.length > 1 && lines[0].includes(',')) {
            // Looks like CSV - check if all lines have similar comma counts
            const firstLineCommas = (lines[0].match(/,/g) || []).length;
            const secondLineCommas = (lines[1].match(/,/g) || []).length;

            if (firstLineCommas > 0 && Math.abs(firstLineCommas - secondLineCommas) <= 1) {
              mimeType = 'text/csv';
            } else {
              mimeType = 'text/plain';
            }
          } else {
            mimeType = 'text/plain';
          }
        } else {
          mimeType = 'text/plain';
        }
      }
    }

    // Route to appropriate component based on mimeType
    switch (mimeType?.toLowerCase()) {
      case 'text/csv':
      case 'application/csv':
        return <StreamingCSV streamingData={propStreamingData} output={output} toolName={name} />;

      case 'application/json':
      case 'text/json':
        return <StreamingJSON streamingData={propStreamingData} output={output} />;

      case 'text/plain':
      case 'text/html':
      case 'text/markdown':
        return <StreamingText streamingData={propStreamingData} output={output} />;

      default:
        // Default to text for unknown types, but only if we have content
        if (propStreamingData || output) {
          return <StreamingText streamingData={propStreamingData} output={output} />;
        }
        return null;
    }
  };

  // Get icon based on mimeType
  const getIcon = () => {
    let mimeType = propStreamingData?.mimeType?.toLowerCase();

    // If no streaming data, try to infer from output
    if (!mimeType && output) {
      // Handle structured output format from Anthropic models
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

      try {
        const parsed = JSON.parse(contentToCheck);
        if (parsed.csv_data || parsed.file?.filename?.endsWith('.csv')) {
          mimeType = 'text/csv';
        } else {
          mimeType = 'application/json';
        }
      } catch {
        mimeType = 'text/plain';
      }
    }

    if (mimeType?.includes('csv')) {
      return <Database className="h-4 w-4 text-blue-500" />;
    }
    if (mimeType?.includes('json')) {
      return <Code className="h-4 w-4 text-green-500" />;
    }
    if (mimeType?.includes('text')) {
      return <AlignLeft className="h-4 w-4 text-gray-500" />;
    }
    return <FileText className="h-4 w-4 text-gray-500" />;
  };

  // Get status text
  const getStatusText = () => {
    if (error) {
      return 'Failed';
    }

    const streaming = propStreamingData && !propStreamingData.isComplete;
    const complete = propStreamingData?.isComplete;
    const progressValue = propStreamingData?.progress || 0;
    const mimeType = propStreamingData?.mimeType || 'data';

    if (streaming) {
      return `Streaming ${mimeType} (${progressValue.toFixed(0)}%)`;
    }
    if (complete) {
      return `Completed`;
    }
    // If we have output but no streaming data, assume it's completed
    if (output) {
      return `Completed`;
    }
    return 'Preparing...';
  };

  // Check if we have streaming content
  const hasStreamingContent = propStreamingData || output;

  if (!hasStreamingContent) {
    // Fall back to regular tool call display
    return (
      <div className="relative my-2.5 flex h-5 shrink-0 items-center gap-2.5">
        <ProgressText
          progress={progress}
          onClick={() => setShowInfo((prev) => !prev)}
          inProgressText={localize('com_assistants_running_var', { 0: name })}
          finishedText={
            error
              ? localize('com_assistants_failed_function', { 0: name })
              : localize('com_assistants_completed_function', { 0: name })
          }
          hasInput={true}
          isExpanded={showInfo}
          error={error}
        />
        {showInfo && args && (
          <div className="mt-2">
            <ToolCallInfo input={args} function_name={name} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="my-3 rounded-lg border border-border-light bg-surface-primary">
      {/* Header */}
      <div className="flex flex-row items-start justify-between gap-2 border-b border-border-light px-3 py-2.5 md:items-center md:gap-3 md:px-4 md:py-3">
        <div className="grow-1 shrink-1 flex min-w-0 items-start gap-2 md:w-auto md:gap-3">
          <div className="mt-0.5 shrink-0">{getIcon()}</div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 md:gap-2">
              <span className="shrink-0 text-xs font-semibold md:text-sm">Tool Output</span>
              <span className="truncate rounded-full bg-surface-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary">
                {name}
              </span>
            </div>
            <div className={`truncate text-xs ${error ? 'text-red-500' : 'text-text-tertiary'}`}>
              {getStatusText()}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowInfo(!showInfo)}
          className="ml-auto gap-1 self-start md:ml-0 md:self-auto"
        >
          {showInfo ? (
            <>
              <ChevronUp className="h-4 w-4" />
              <span className="hidden md:inline">Hide</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              <span className="hidden md:inline">Show</span>
            </>
          )}
        </Button>
      </div>

      {/* Content */}
      {showInfo && (
        <div className="p-3 md:p-4">
          {/* Render the appropriate streaming component */}
          {renderStreamingContent()}

          {/* Tool Arguments */}
          {args && (
            <details className="group mt-4">
              <summary className="cursor-pointer text-xs font-medium text-text-secondary hover:text-text-primary">
                Tool Arguments
              </summary>
              <div className="mt-2">
                <ToolCallInfo input={args} function_name={name} />
              </div>
            </details>
          )}

          {/* Attachments */}
          {attachments && attachments.length > 0 && (
            <div className="mt-4">
              <AttachmentGroup attachments={attachments} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
