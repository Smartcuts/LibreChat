import { useCallback, useRef } from 'react';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import type { Agents } from 'librechat-data-provider';
import { artifactsState, currentArtifactId, artifactsVisibility } from '~/store/artifacts';
import type { Artifact } from '~/common';

interface DataTableArtifact extends Artifact {
  type: 'application/vnd.data-table';
  data?: {
    headers?: string[];
    rows?: Array<Array<string | number | boolean | null>>;
    totalRows?: number;
    mimeType?: string;
    metadata?: Record<string, unknown>;
  };
}

export function useStreamingArtifact() {
  const setArtifacts = useSetRecoilState(artifactsState);
  const setCurrentArtifactId = useSetRecoilState(currentArtifactId);
  const setArtifactsVisibility = useSetRecoilState(artifactsVisibility);
  const artifactsVisible = useRecoilValue(artifactsVisibility);
  const artifactIdRef = useRef<string | null>(null);

  const createDataArtifact = useCallback(
    (params: {
      streamingData?: Agents.ToolCall['streaming_data'];
      output?: string;
      toolName: string;
      messageId: string;
      csvRows?: string[];
      metadata?: Record<string, unknown>;
    }) => {
      const { streamingData, output, toolName, messageId, csvRows, metadata } = params;

      // Parse CSV rows to extract headers and data
      let headers: string[] = [];
      let rows: Array<Array<string | number | boolean | null>> = [];

      if (csvRows && csvRows.length > 0) {
        // First row is headers
        headers = csvRows[0].split(',').map((h) => h.trim());

        // Rest are data rows
        rows = csvRows.slice(1).map((row) => {
          return row.split(',').map((cell) => {
            const trimmed = cell.trim();
            // Try to parse as number
            if (!isNaN(Number(trimmed)) && trimmed !== '') {
              return Number(trimmed);
            }
            // Check for boolean
            if (trimmed.toLowerCase() === 'true') return true;
            if (trimmed.toLowerCase() === 'false') return false;
            // Check for null
            if (trimmed === 'null' || trimmed === '') return null;
            // Return as string
            return trimmed;
          });
        });
      } else if (output) {
        // Try to parse output as JSON
        try {
          const parsed = JSON.parse(output);
          if (parsed.csv_data) {
            const csvData = parsed.csv_data as string[];
            if (csvData.length > 0) {
              headers = csvData[0].split(',').map((h) => h.trim());
              rows = csvData.slice(1).map((row) => row.split(',').map((cell) => cell.trim()));
            }
          } else if (Array.isArray(parsed)) {
            // Handle JSON array data
            if (parsed.length > 0 && typeof parsed[0] === 'object') {
              headers = Object.keys(parsed[0]);
              rows = parsed.map((item) => headers.map((h) => item[h]));
            }
          }
        } catch {
          // Handle raw CSV text
          const lines = output.split(/\r?\n/).filter((line) => line.trim() !== '');
          if (lines.length > 0) {
            headers = lines[0].split(',').map((h) => h.trim());
            rows = lines.slice(1).map((row) => row.split(',').map((cell) => cell.trim()));
          }
        }
      }

      const artifactId = `data_table_${toolName}_${messageId}_${Date.now()}`
        .replace(/\s+/g, '_')
        .toLowerCase();

      const artifact: DataTableArtifact = {
        id: artifactId,
        identifier: artifactId,
        title: `Data Table: ${toolName}`,
        type: 'application/vnd.data-table',
        content: JSON.stringify({ headers, rows }, null, 2),
        messageId,
        lastUpdateTime: Date.now(),
        data: {
          headers,
          rows,
          totalRows: streamingData?.total || rows.length,
          mimeType: streamingData?.mimeType || 'text/csv',
          metadata,
        },
      };

      // Update artifacts state
      setArtifacts((prev) => ({
        ...prev,
        [artifactId]: artifact,
      }));

      // Set as current artifact
      setCurrentArtifactId(artifactId);

      // Show artifacts panel
      setArtifactsVisibility(true);

      // Store the artifact ID for updates
      artifactIdRef.current = artifactId;

      return artifact;
    },
    [setArtifacts, setCurrentArtifactId, setArtifactsVisibility],
  );

  const updateDataArtifact = useCallback(
    (artifactId: string, updates: Partial<DataTableArtifact>) => {
      setArtifacts((prev) => {
        const existing = prev?.[artifactId];
        if (!existing) return prev;

        return {
          ...prev,
          [artifactId]: {
            ...existing,
            ...updates,
            lastUpdateTime: Date.now(),
          },
        };
      });
    },
    [setArtifacts],
  );

  const createArtifact = useCallback(
    (params: {
      type: string;
      title: string;
      content: string;
      messageId: string;
    }) => {
      const { type, title, content, messageId } = params;

      const artifactId = `${type}_${title}_${messageId}_${Date.now()}`
        .replace(/\s+/g, '_')
        .toLowerCase();

      const artifact: Artifact = {
        id: artifactId,
        identifier: artifactId,
        title,
        type,
        content,
        messageId,
        lastUpdateTime: Date.now(),
      };

      // Update artifacts state
      setArtifacts((prev) => ({
        ...prev,
        [artifactId]: artifact,
      }));

      // Set as current artifact
      setCurrentArtifactId(artifactId);

      // Show artifacts panel
      setArtifactsVisibility(true);

      // Store the artifact ID for updates
      artifactIdRef.current = artifactId;

      return artifact;
    },
    [setArtifacts, setCurrentArtifactId, setArtifactsVisibility],
  );

  const updateArtifact = useCallback(
    (artifactId: string, updates: Partial<Artifact>) => {
      setArtifacts((prev) => {
        const existing = prev?.[artifactId];
        if (!existing) return prev;

        return {
          ...prev,
          [artifactId]: {
            ...existing,
            ...updates,
            lastUpdateTime: Date.now(),
          },
        };
      });
    },
    [setArtifacts],
  );

  // Check if artifact panel is open
  const isArtifactOpen = useCallback(() => {
    return artifactsVisible && artifactIdRef.current !== null;
  }, [artifactsVisible]);

  // Reset artifact reference when panel closes
  const resetArtifactRef = useCallback(() => {
    artifactIdRef.current = null;
  }, []);

  return {
    createArtifact,
    updateArtifact,
    createDataArtifact,
    updateDataArtifact,
    isArtifactOpen,
    resetArtifactRef,
    artifactIdRef,
  };
}
