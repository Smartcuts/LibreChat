import { useRef, useEffect } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import type { SandpackPreviewRef } from '@codesandbox/sandpack-react/unstyled';
import type { CodeEditorRef } from '@codesandbox/sandpack-react';
import type { Artifact } from '~/common';
import { useCodeState } from '~/Providers/EditorContext';
import { useArtifactsContext } from '~/Providers';
import useArtifactProps from '~/hooks/Artifacts/useArtifactProps';
import { useAutoScroll } from '~/hooks/Artifacts/useAutoScroll';
import { ArtifactCodeEditor } from './ArtifactCodeEditor';
import { useGetStartupConfig } from '~/data-provider';
import { ArtifactPreview } from './ArtifactPreview';
import DataTableArtifact from './DataTableArtifact';
import { cn } from '~/utils';

export default function ArtifactTabs({
  artifact,
  editorRef,
  previewRef,
  isSharedConvo,
}: {
  artifact: Artifact;
  editorRef: React.MutableRefObject<CodeEditorRef>;
  previewRef: React.MutableRefObject<SandpackPreviewRef>;
  isSharedConvo?: boolean;
}) {
  const { isSubmitting } = useArtifactsContext();
  const { currentCode, setCurrentCode } = useCodeState();
  const { data: startupConfig } = useGetStartupConfig();
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (artifact.id !== lastIdRef.current) {
      setCurrentCode(undefined);
    }
    lastIdRef.current = artifact.id;
  }, [setCurrentCode, artifact.id]);

  const content = artifact.content ?? '';
  const contentRef = useRef<HTMLDivElement>(null);
  useAutoScroll({ ref: contentRef, content, isSubmitting });

  const { files, fileKey, template, sharedProps } = useArtifactProps({ artifact });

  // Check if this is a data table artifact
  const isDataTable = artifact.type === 'application/vnd.data-table';

  if (isDataTable) {
    return (
      <>
        <Tabs.Content value="code" id="artifacts-code" className={cn('flex-grow overflow-auto')}>
          <DataTableArtifact artifact={artifact} />
        </Tabs.Content>
        <Tabs.Content value="preview" className={cn('flex-grow overflow-auto')}>
          <DataTableArtifact artifact={artifact} />
        </Tabs.Content>
      </>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <Tabs.Content
        ref={contentRef}
        value="code"
        id="artifacts-code"
        className="h-full w-full flex-grow overflow-auto"
        tabIndex={-1}
      >
        <ArtifactCodeEditor
          files={files}
          fileKey={fileKey}
          template={template}
          artifact={artifact}
          editorRef={editorRef}
          sharedProps={sharedProps}
          readOnly={isSharedConvo}
        />
      </Tabs.Content>

      <Tabs.Content value="preview" className="h-full w-full flex-grow overflow-auto" tabIndex={-1}>
        <ArtifactPreview
          files={files}
          fileKey={fileKey}
          template={template}
          previewRef={previewRef}
          sharedProps={sharedProps}
          currentCode={currentCode}
          startupConfig={startupConfig}
        />
      </Tabs.Content>
    </div>
  );
}
