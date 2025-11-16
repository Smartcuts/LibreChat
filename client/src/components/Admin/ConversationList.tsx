import { useEffect } from 'react';
import { useInView } from 'react-intersection-observer';
import type { TConversation } from 'librechat-data-provider';
import { TooltipAnchor, useToastContext } from '@librechat/client';
import { useAdminConversationsInfiniteQuery } from '~/data-provider/Admin';

interface ConversationListProps {
  userId: string | null;
  searchQuery: string;
  onConversationSelect: (conversation: TConversation) => void;
  selectedConversationId: string | null;
}

export default function ConversationList({
  userId,
  searchQuery,
  onConversationSelect,
  selectedConversationId,
}: ConversationListProps) {
  const { ref, inView } = useInView();
  const { showToast } = useToastContext();

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } =
    useAdminConversationsInfiniteQuery({
      userId: userId || undefined,
      search: searchQuery || undefined,
    });

  const handleCopyId = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering conversation selection
    try {
      await navigator.clipboard.writeText(id);
      showToast({ message: 'ID copied to clipboard!', status: 'success' });
    } catch (error) {
      showToast({ message: 'Failed to copy ID', status: 'error' });
    }
  };

  // Load more when scrolling to bottom
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const conversations = data?.pages.flatMap((page) => page.conversations).filter(Boolean) || [];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading conversations...</div>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {searchQuery || userId
              ? 'No conversations found with current filters'
              : 'No conversations found'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-200 dark:divide-gray-700">
      {conversations.map(
        (
          conversation: TConversation & {
            messageCount?: number;
            user?: { email?: string; name?: string };
          },
        ) => (
          <button
            key={conversation.conversationId}
            onClick={() => onConversationSelect(conversation)}
            className={`w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${
              selectedConversationId === conversation.conversationId
                ? 'bg-green-50 dark:bg-green-900/20'
                : ''
            }`}
          >
            {/* Title */}
            <div className="mb-1 font-medium text-gray-900 dark:text-white">
              {conversation.title || 'New Chat'}
            </div>

            {/* User Email */}
            {conversation.user && (
              <div className="mb-1 text-xs text-gray-600 dark:text-gray-400">
                User: {conversation.user.email || conversation.user.name || conversation.user}
              </div>
            )}

            {/* Metadata */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              {conversation.messageCount !== undefined && (
                <span>{conversation.messageCount} messages</span>
              )}
              {conversation.endpoint && <span className="capitalize">{conversation.endpoint}</span>}
              {conversation.model && <span>{conversation.model}</span>}
            </div>

            {/* Tags */}
            {conversation.tags && conversation.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {conversation.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Updated: {formatDate(conversation.updatedAt)}</span>
              <TooltipAnchor
                description="Click to copy full ID"
                render={
                  <span
                    className="cursor-pointer font-mono text-xs hover:text-green-600 dark:hover:text-green-400"
                    onClick={(e) => handleCopyId(conversation.conversationId, e)}
                  >
                    ID: {conversation.conversationId.slice(0, 8)}...
                  </span>
                }
              />
            </div>
          </button>
        ),
      )}

      {/* Load more trigger */}
      {hasNextPage && (
        <div ref={ref} className="flex items-center justify-center p-4">
          {isFetchingNextPage ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Loading more...</div>
          ) : (
            <button
              onClick={() => fetchNextPage()}
              className="text-sm text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
            >
              Load more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
