import { useState, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import type { TConversation } from 'librechat-data-provider';
import ConversationList from './ConversationList';
import ConversationDetail from './ConversationDetail';
import UserSearchFilter from './UserSearchFilter';
import AdminArtifactWrapper from './AdminArtifactWrapper';
import Artifacts from '~/components/Artifacts/Artifacts';
import { SidePanelGroup } from '~/components/SidePanel';
import store from '~/store';

export default function AdminConsoleView() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Artifact state for side panel
  const artifacts = useRecoilValue(store.artifactsState);
  const artifactsVisibility = useRecoilValue(store.artifactsVisibility);

  // Memoize artifacts JSX to prevent recreating it on every render
  const artifactsElement = useMemo(() => {
    if (artifactsVisibility === true && Object.keys(artifacts ?? {}).length > 0) {
      return <Artifacts />;
    }
    return null;
  }, [artifactsVisibility, artifacts]);

  const defaultLayout = useMemo(() => {
    const resizableLayout = localStorage.getItem('react-resizable-panels:layout:admin');
    return typeof resizableLayout === 'string' ? JSON.parse(resizableLayout) : undefined;
  }, []);

  const defaultCollapsed = useMemo(() => {
    const collapsedPanels = localStorage.getItem('react-resizable-panels:collapsed:admin');
    return typeof collapsedPanels === 'string' ? JSON.parse(collapsedPanels) : true;
  }, []);

  const fullCollapse = useMemo(
    () => localStorage.getItem('fullPanelCollapse:admin') === 'true',
    [],
  );

  const handleConversationSelect = (conversation: TConversation) => {
    setSelectedConversationId(conversation.conversationId);
  };

  const handleUserSelect = (userId: string | null) => {
    setSelectedUserId(userId);
    setSelectedConversationId(null); // Clear selected conversation when changing user filter
  };

  const handleBackToList = () => {
    setSelectedConversationId(null);
  };

  return (
    <AdminArtifactWrapper>
      <div className="flex h-screen overflow-hidden bg-white dark:bg-gray-900">
        {/* Left Panel - Conversation List */}
        <div
          className={`${
            selectedConversationId ? 'hidden lg:flex' : 'flex'
          } w-full flex-col border-r border-gray-200 dark:border-gray-700 lg:w-1/3`}
        >
        {/* Header */}
        <div className="border-b border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Console</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            View and manage all user conversations
          </p>
        </div>
        {/* User Search Filter */}
        <div className="border-b border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
          <UserSearchFilter onUserSelect={handleUserSelect} selectedUserId={selectedUserId} />
        </div>
        {/* Search Bar */}
        {/*
        <div className="border-b border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
          />
        </div>
          */}
        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          <ConversationList
            userId={selectedUserId}
            searchQuery={searchQuery}
            onConversationSelect={handleConversationSelect}
            selectedConversationId={selectedConversationId}
          />
        </div>
      </div>

        {/* Right Panel - Conversation Detail with Artifacts */}
        <div
          className={`${selectedConversationId ? 'flex' : 'hidden lg:flex'} w-full lg:w-2/3`}
        >
          <SidePanelGroup
            defaultLayout={defaultLayout}
            fullPanelCollapse={fullCollapse}
            defaultCollapsed={defaultCollapsed}
            artifacts={artifactsElement}
          >
            <main className="flex h-full flex-col overflow-y-auto" role="main">
              {selectedConversationId ? (
                <ConversationDetail
                  conversationId={selectedConversationId}
                  onBack={handleBackToList}
                />
              ) : (
                <div className="flex h-full items-center justify-center p-8">
                  <div className="text-center">
                    <svg
                      className="mx-auto h-12 w-12 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                    <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                      No conversation selected
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Select a conversation from the list to view its details and messages.
                    </p>
                  </div>
                </div>
              )}
            </main>
          </SidePanelGroup>
        </div>
      </div>
    </AdminArtifactWrapper>
  );
}
