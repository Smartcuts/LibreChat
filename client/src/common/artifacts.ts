export interface CodeBlock {
  id: string;
  language: string;
  content: string;
}

export interface Artifact {
  id: string;
  lastUpdateTime: number;
  index?: number;
  messageId?: string;
  identifier?: string;
  language?: string;
  content?: string;
  title?: string;
  type?: string;
}

export interface ExcelSpreadsheetArtifact extends Artifact {
  type: 'application/vnd.ms-excel';
  data?: {
    artifactId: string;
    s3Key: string;
    downloadUrl: string;
    headers: string[];
    rows: Array<Array<string | number | boolean | null>>;
    metadata: {
      sheetCount?: number;
      rowCount: number;
      columnCount: number;
      currentVersionId?: string;
      versions?: Array<{
        versionId: string;
        timestamp: number;
        isLatest: boolean;
      }>;
    };
  };
}

export type ArtifactFiles =
  | {
      'App.tsx': string;
      'index.tsx': string;
      '/components/ui/MermaidDiagram.tsx': string;
    }
  | Partial<{
      [x: string]: string | undefined;
    }>;
