import React, { useMemo } from 'react';
import { ChatContext } from '~/Providers/ChatContext';
import { EditorProvider, SidePanelProvider, ArtifactsProvider } from '~/Providers';

/**
 * AdminArtifactWrapper provides minimal contexts needed for artifact functionality
 * in the admin console, without requiring full chat infrastructure
 */
export default function AdminArtifactWrapper({ children }: { children: React.ReactNode }) {
  // Create minimal ChatContext value for admin console
  // ArtifactsProvider needs: isSubmitting, latestMessage, conversation
  const minimalChatContext = useMemo(
    () => ({
      isSubmitting: false,
      latestMessage: null,
      conversation: null,
      // Add empty stubs for other required fields from useChatHelpers
      // These won't be used in admin console but are needed for type compatibility
      files: [],
      setFiles: () => {},
      filesLoading: false,
      setFilesLoading: () => {},
      setConversation: () => {},
      setIsSubmitting: () => {},
      setLatestMessage: () => {},
      resetLatestMessage: () => {},
      setSiblingIdx: () => {},
      setMessages: () => {},
      getMessages: () => [],
      messagesTree: null,
      ask: async () => {},
      regenerate: async () => {},
      stopGenerating: () => {},
      continueGeneration: async () => {},
      handleStopGenerating: () => {},
      clearAllSubmissions: () => {},
      newConversation: () => {},
    }),
    [],
  );

  return (
    <ChatContext.Provider value={minimalChatContext as any}>
      <SidePanelProvider>
        <ArtifactsProvider>
          <EditorProvider>{children}</EditorProvider>
        </ArtifactsProvider>
      </SidePanelProvider>
    </ChatContext.Provider>
  );
}
