import { useState, useEffect, useMemo, useRef } from 'react';
import { CheckCircle, Download, FileText, Maximize2 } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { Button } from '@librechat/client';
import type { Agents } from 'librechat-data-provider';
import { useMessageContext } from '~/Providers';
import { useStreamingArtifact } from '~/hooks/useStreamingArtifact';
import { artifactsVisibility } from '~/store/artifacts';
import CSVTable from './CSVTable';
import { cn } from '~/utils';

interface FileMetadata {
  file_id: string;
  filename: string;
  filepath: string;
  bytes: number;
  rows: number;
  download_url: string;
}

interface StreamingCSVProps {
  streamingData?: Agents.ToolCall['streaming_data'];
  output?: string;
  maxRows?: number;
  toolName?: string;
}

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

// Helper function to normalize CSV rows to have consistent column count
function normalizeCSVRows(rows: string[]): string[] {
  if (rows.length === 0) return rows;

  // Filter out any rows that are just commas or empty
  const validRows = rows.filter((row) => {
    // Remove a row if it's just commas with no content
    const trimmed = row.replace(/,/g, '').trim();
    return trimmed !== '';
  });

  if (validRows.length === 0) return [];

  // Count columns in the header (first row)
  const headerColumnCount = validRows[0].split(',').length;

  // Normalize each row to have the same number of columns
  return validRows.map((row, index) => {
    const cells = row.split(',');
    const cellCount = cells.length;

    if (cellCount === headerColumnCount) {
      // Row has the correct number of columns
      return row;
    } else if (cellCount < headerColumnCount) {
      // Row has fewer columns - pad with empty values
      const emptyCells = Array(headerColumnCount - cellCount).fill('');
      return [...cells, ...emptyCells].join(',');
    } else {
      // Row has more columns - truncate (shouldn't happen often)
      return cells.slice(0, headerColumnCount).join(',');
    }
  });
}

export default function StreamingCSV({
  streamingData,
  output,
  maxRows = 15,
  toolName = 'CSV Data',
}: StreamingCSVProps) {
  const [csvRows, setCsvRows] = useState<string[]>([]);
  const [fileMetadata, setFileMetadata] = useState<FileMetadata | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const artifactIdRef = useRef<string | null>(null);

  const { messageId } = useMessageContext();
  const {
    createDataArtifact,
    updateDataArtifact,
    artifactIdRef: globalArtifactIdRef,
  } = useStreamingArtifact();
  const isArtifactsVisible = useRecoilValue(artifactsVisibility);

  // Parse output for file metadata and initial data
  const parsedOutput = useMemo(() => {
    if (!output) return null;
    try {
      return JSON.parse(output);
    } catch {
      return null;
    }
  }, [output]);

  // Process streaming chunks into CSV rows
  useEffect(() => {
    if (streamingData && streamingData.chunks.length > 0) {
      const { chunks, isComplete } = streamingData;

      const allRows: string[] = [];
      let partialRow = '';

      chunks
        .filter((chunkEntry) => chunkEntry && chunkEntry.data !== undefined)
        .forEach((chunkEntry, index) => {
          const chunk = chunkEntry.data;
          let rowData: string = '';

          // Handle different chunk formats
          if (typeof chunk === 'string') {
            rowData = chunk;
          } else if (typeof chunk === 'object' && chunk !== null) {
            // Check if it's a CSV row object
            if ('row_data' in chunk) {
              rowData = (chunk as any).row_data;
            } else if ('csv' in chunk) {
              rowData = (chunk as any).csv;
            } else {
              // Convert object to CSV row
              rowData = Object.values(chunk).join(',');
            }
          } else {
            rowData = String(chunk);
          }

          // Prepend any partial row from the previous chunk
          if (partialRow) {
            rowData = partialRow + rowData;
            partialRow = '';
          }

          // Split by newlines to get individual rows
          const lines = rowData.split(/\r?\n/);

          // If this is the last chunk in the array (not necessarily the final chunk)
          // and doesn't end with newline, save as partial
          const isLastChunk = index === chunks.filter((c) => c && c.data !== undefined).length - 1;
          if (!isComplete && isLastChunk && !rowData.endsWith('\n')) {
            partialRow = lines.pop() || '';
          }

          // Add complete lines, filtering out only truly empty lines
          lines.forEach((line) => {
            if (line !== '') {
              allRows.push(line);
            }
          });
        });

      // Only add partial row if it has actual content and we're still streaming
      if (!isComplete && partialRow && partialRow.trim() !== '') {
        allRows.push(partialRow);
      }

      // Always keep data visible, normalize when complete
      const normalizedRows = isComplete ? normalizeCSVRows(allRows) : allRows;

      // Only update if we have data
      if (normalizedRows.length > 0) {
        setCsvRows(normalizedRows);
        setRowCount(normalizedRows.length);

        // Update artifact if it exists
        if (artifactIdRef.current && isArtifactsVisible) {
          // Parse CSV rows to extract headers and data
          let headers: string[] = [];
          let rows: Array<Array<string | number | boolean | null>> = [];

          if (normalizedRows.length > 0) {
            headers = normalizedRows[0].split(',').map((h) => h.trim());
            rows = normalizedRows.slice(1).map((row) => {
              return row.split(',').map((cell) => {
                const trimmed = cell.trim();
                if (!isNaN(Number(trimmed)) && trimmed !== '') {
                  return Number(trimmed);
                }
                if (trimmed.toLowerCase() === 'true') return true;
                if (trimmed.toLowerCase() === 'false') return false;
                if (trimmed === 'null' || trimmed === '') return null;
                return trimmed;
              });
            });
          }

          updateDataArtifact(artifactIdRef.current, {
            content: JSON.stringify({ headers, rows }, null, 2),
            data: {
              headers,
              rows,
              totalRows: streamingData?.total || rows.length,
              mimeType: streamingData?.mimeType || 'text/csv',
              metadata: fileMetadata ? { ...fileMetadata } : undefined,
            },
          });
        }
      }
    }
  }, [streamingData, fileMetadata, updateDataArtifact, isArtifactsVisible]);

  // Handle completed state with file metadata from output
  useEffect(() => {
    if (parsedOutput) {
      // Set file metadata if available
      if (parsedOutput.file) {
        setFileMetadata(parsedOutput.file);
      }

      // Set CSV data from output if we don't have streaming data
      // or if we have more complete data in the output
      if (parsedOutput.csv_data && !streamingData) {
        setCsvRows(parsedOutput.csv_data);
        setRowCount(parsedOutput.csv_data.length);
      }
    } else if (!streamingData && output && typeof output === 'string') {
      // Handle raw CSV output when no streaming data and output is not JSON
      const lines = output.split(/\r?\n/).filter((line) => line.trim() !== '');
      if (lines.length > 0) {
        setCsvRows(lines);
        setRowCount(lines.length);
      }
    }
  }, [parsedOutput, streamingData, output]);

  // Calculate progress
  const progress = streamingData?.progress || 0;
  const isComplete = streamingData?.isComplete || parsedOutput?.status === 'completed';
  const totalRows = streamingData?.total || fileMetadata?.rows || rowCount;

  // Reset artifact state when panel closes
  useEffect(() => {
    if (!isArtifactsVisible && artifactIdRef.current) {
      artifactIdRef.current = null;
    }
  }, [isArtifactsVisible]);

  // Handle artifact creation for large datasets
  const handleViewFullData = () => {
    if (csvRows.length > 0) {
      const artifact = createDataArtifact({
        streamingData,
        output,
        toolName,
        messageId,
        csvRows,
        metadata: fileMetadata ? { ...fileMetadata } : undefined,
      });
      artifactIdRef.current = artifact.id;
    }
  };

  // Check if artifact is created and panel is open
  const isArtifactActive = artifactIdRef.current && isArtifactsVisible;

  // Check if we should show the "View Full Data" button
  const shouldShowFullDataButton = csvRows.length > maxRows + 1; // +1 for header

  // Don't return null if we have streaming data, even if csvRows is empty momentarily
  if (!streamingData && !parsedOutput && csvRows.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* CSV Table - Always show if we have data */}
      {csvRows.length > 0 ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold">
              {shouldShowFullDataButton ? 'Data Preview (First 15 rows)' : 'Data'}
            </h4>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-tertiary">
                {csvRows.length - 1} rows loaded
                {totalRows && totalRows > csvRows.length && ` of ${totalRows} total`}
              </span>
              {shouldShowFullDataButton && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleViewFullData}
                  className="gap-1"
                  disabled={!!isArtifactActive}
                >
                  <Maximize2 className="h-3 w-3" />
                  {isArtifactActive ? 'Viewing in Artifact' : 'View Full Data'}
                </Button>
              )}
            </div>
          </div>
          <CSVTable data={csvRows} maxRows={maxRows} />
        </div>
      ) : (
        // Show placeholder while waiting for data
        streamingData &&
        !isComplete && <div className="text-sm text-text-tertiary">Waiting for data...</div>
      )}

      {/* Progress indicator */}
      {!isComplete && progress > 0 && (
        <div className="text-xs text-text-secondary">Loading: {progress.toFixed(0)}%</div>
      )}

      {/* Completion Status with File Download */}
      {isComplete && fileMetadata && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
            <CheckCircle className="h-4 w-4" />
            <div>
              <div className="font-semibold">CSV Ready</div>
              <div className="mt-1 text-xs">
                {fileMetadata.rows} rows • {csvRows.length > 0 ? csvRows[0].split(',').length : 0}{' '}
                columns
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border-light bg-surface-tertiary p-4">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-text-secondary" />
              <div>
                <div className="text-sm font-medium">{fileMetadata.filename}</div>
                <div className="text-xs text-text-tertiary">
                  {fileMetadata.rows} rows • {formatFileSize(fileMetadata.bytes)}
                </div>
              </div>
            </div>
            <Button
              size="sm"
              className="gap-2"
              onClick={() => {
                const link = document.createElement('a');
                link.href = fileMetadata.download_url;
                link.download = fileMetadata.filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
            >
              <Download className="h-4 w-4" />
              Download CSV
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
