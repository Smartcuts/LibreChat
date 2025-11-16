import { useAtomValue } from 'jotai';
import type { TMessage } from 'librechat-data-provider';
import MinimalHoverButtons from '~/components/Chat/Messages/MinimalHoverButtons';
import MessageContent from '~/components/Chat/Messages/Content/MessageContent';
import SearchContent from '~/components/Chat/Messages/Content/SearchContent';
import { Plugin } from '~/components/Messages/Content';
import { fontSizeAtom } from '~/store/fontSize';
import { MessageContext } from '~/Providers';
import { useAttachments } from '~/hooks';
import { cn } from '~/utils';

interface AdminMessageProps {
  message: TMessage;
}

export default function AdminMessage({ message }: AdminMessageProps) {
  const fontSize = useAtomValue(fontSizeAtom);

  const { attachments, searchResults } = useAttachments({
    messageId: message?.messageId,
    attachments: message?.attachments,
  });

  if (!message) {
    return null;
  }

  const {
    text = '',
    error = false,
    messageId = '',
    unfinished = false,
    isCreatedByUser = true,
  } = message;

  let messageLabel = '';
  if (isCreatedByUser) {
    messageLabel = 'User';
  } else {
    messageLabel = message.sender ?? 'Assistant';
  }

  return (
    <div className="text-token-text-primary w-full border-0 bg-transparent dark:border-0 dark:bg-transparent">
      <div className="m-auto justify-center p-4 py-2">
        <div className="final-completion group mx-auto flex flex-1 gap-3">
          <div
            className={cn('relative flex w-full flex-col', isCreatedByUser ? '' : 'agent-turn')}
          >
            <div className={cn('select-none font-semibold', fontSize)}>{messageLabel}</div>
            <div className="flex-col gap-1 md:gap-3">
              <div className="flex max-w-full flex-grow flex-col gap-0">
                <MessageContext.Provider
                  value={{
                    messageId,
                    isExpanded: false,
                    conversationId: null,
                    isSubmitting: false,
                    isLatestMessage: false,
                  }}
                >
                  {/* Legacy Plugins */}
                  {message.plugin && <Plugin plugin={message.plugin} />}
                  {message.content ? (
                    <SearchContent
                      message={message}
                      attachments={attachments}
                      searchResults={searchResults}
                    />
                  ) : (
                    <MessageContent
                      edit={false}
                      error={error}
                      isLast={false}
                      ask={() => ({})}
                      text={text || ''}
                      message={message}
                      isSubmitting={false}
                      enterEdit={() => ({})}
                      unfinished={unfinished}
                      siblingIdx={0}
                      isCreatedByUser={isCreatedByUser}
                      setSiblingIdx={() => ({})}
                    />
                  )}
                </MessageContext.Provider>
              </div>
            </div>
            <div className="mt-1 flex items-center justify-end gap-2 text-xs">
              <MinimalHoverButtons message={message} searchResults={searchResults} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
