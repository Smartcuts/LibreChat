import { useAdminConversationQuery } from '~/data-provider/Admin';
import SimpleMessageList from './SimpleMessageList';

interface ConversationDetailProps {
  conversationId: string;
  onBack: () => void;
}

export default function ConversationDetail({ conversationId, onBack }: ConversationDetailProps) {
  const { data, isLoading, isError } = useAdminConversationQuery(conversationId);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Loading conversation...
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-600 dark:text-red-400">
            Error loading conversation
          </p>
          <button
            onClick={onBack}
            className="mt-4 text-sm text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
          >
            ← Back to list
          </button>
        </div>
      </div>
    );
  }

  const { conversation, messages } = data;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {/* Back Button (mobile) */}
            <button
              onClick={onBack}
              className="mb-2 flex items-center text-sm text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 lg:hidden"
            >
              <svg
                className="mr-1 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to list
            </button>

            {/* Title */}
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {conversation.title || 'New Chat'}
            </h2>

            {/* User Info */}
            {conversation.user && (
              <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                User: {typeof conversation.user === 'object' && conversation.user.email
                  ? conversation.user.email
                  : conversation.user}
              </div>
            )}

            {/* Metadata Grid */}
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Conversation ID:
                </span>
                <div className="font-mono text-xs text-gray-600 dark:text-gray-400">
                  {conversation.conversationId}
                </div>
              </div>

              {conversation.endpoint && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Endpoint:
                  </span>
                  <div className="capitalize text-gray-600 dark:text-gray-400">
                    {conversation.endpoint}
                  </div>
                </div>
              )}

              {conversation.model && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Model:
                  </span>
                  <div className="text-gray-600 dark:text-gray-400">
                    {conversation.model}
                  </div>
                </div>
              )}

              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Messages:
                </span>
                <div className="text-gray-600 dark:text-gray-400">
                  {messages.length}
                </div>
              </div>

              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Created:
                </span>
                <div className="text-gray-600 dark:text-gray-400">
                  {formatDate(conversation.createdAt)}
                </div>
              </div>

              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Updated:
                </span>
                <div className="text-gray-600 dark:text-gray-400">
                  {formatDate(conversation.updatedAt)}
                </div>
              </div>
            </div>

            {/* Tags */}
            {conversation.tags && conversation.tags.length > 0 && (
              <div className="mt-3">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Tags:
                </span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {conversation.tags.map((tag: string) => (
                    <span
                      key={tag}
                      className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No messages in this conversation
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl p-4">
            <SimpleMessageList messages={messages} />
          </div>
        )}
      </div>
    </div>
  );
}
