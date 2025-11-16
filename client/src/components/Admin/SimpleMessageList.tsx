import type { TMessage } from 'librechat-data-provider';
import { TooltipAnchor, useToastContext } from '@librechat/client';
import AdminMessage from './AdminMessage';

interface SimpleMessageListProps {
  messages: TMessage[];
}

// Flatten message tree into a simple chronological list
function flattenMessages(messages: TMessage[]): TMessage[] {
  if (!messages || messages.length === 0) return [];

  // Sort messages by creation date
  return messages.sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateA - dateB;
  });
}

export default function SimpleMessageList({ messages }: SimpleMessageListProps) {
  const { showToast } = useToastContext();
  const flatMessages = flattenMessages(messages);

  const handleCopyId = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(id);
      showToast({ message: 'ID copied to clipboard!', status: 'success' });
    } catch (error) {
      showToast({ message: 'Failed to copy ID', status: 'error' });
    }
  };

  if (flatMessages.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-sm text-gray-500 dark:text-gray-400">No messages</p>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {flatMessages.map((message, index) => (
        <div key={message.messageId} className="border-b border-gray-200 pb-4 dark:border-gray-700">
          {/* Admin Metadata Header */}
          <div className="mb-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <div>
              #{index + 1} • {formatDate(message.createdAt)}
              {message.tokenCount && ` • ${message.tokenCount} tokens`}
            </div>
            <TooltipAnchor
              description="Click to copy full ID"
              className="text-xs"
              render={
                <div
                  className="cursor-pointer font-mono text-xs hover:text-green-600 dark:hover:text-green-400"
                  onClick={(e) => handleCopyId(message.messageId, e)}
                >
                  ID: {message.messageId.slice(0, 8)}...
                </div>
              }
            />
          </div>

          {/* Message Content - rendered with full fidelity */}
          <AdminMessage message={message} />
        </div>
      ))}
    </div>
  );
}
