import { useCallback, useRef } from 'react';
import {
  Constants,
  StepTypes,
  ContentTypes,
  ToolCallTypes,
  getNonEmptyValue,
} from 'librechat-data-provider';
import type {
  Agents,
  TMessage,
  PartMetadata,
  EventSubmission,
  TMessageContentParts,
} from 'librechat-data-provider';
import type { SetterOrUpdater } from 'recoil';
import type { AnnounceOptions } from '~/common';
import { MESSAGE_UPDATE_INTERVAL } from '~/common';

type TUseStepHandler = {
  announcePolite: (options: AnnounceOptions) => void;
  setMessages: (messages: TMessage[]) => void;
  getMessages: () => TMessage[] | undefined;
  setIsSubmitting: SetterOrUpdater<boolean>;
  lastAnnouncementTimeRef: React.MutableRefObject<number>;
};

type TStepEvent = {
  event: string;
  data:
    | Agents.MessageDeltaEvent
    | Agents.AgentUpdate
    | Agents.RunStep
    | Agents.ToolEndEvent
    | Agents.ToolCallResultDeltaEvent
    | {
        runId?: string;
        message: string;
      };
};

type MessageDeltaUpdate = { type: ContentTypes.TEXT; text: string; tool_call_ids?: string[] };

type ReasoningDeltaUpdate = { type: ContentTypes.THINK; think: string };

type ChunkEntry<TChunk> = {
  progress: number;
  data: TChunk;
  timestamp: number;
};

type AllContentTypes =
  | ContentTypes.TEXT
  | ContentTypes.THINK
  | ContentTypes.TOOL_CALL
  | ContentTypes.IMAGE_FILE
  | ContentTypes.IMAGE_URL
  | ContentTypes.ERROR;

export default function useStepHandler({
  setMessages,
  getMessages,
  setIsSubmitting,
  announcePolite,
  lastAnnouncementTimeRef,
}: TUseStepHandler) {
  const toolCallIdMap = useRef(new Map<string, string | undefined>());
  const messageMap = useRef(new Map<string, TMessage>());
  const stepMap = useRef(new Map<string, Agents.RunStep>());

  const calculateContentIndex = (
    baseIndex: number,
    initialContent: TMessageContentParts[],
    incomingContentType: string,
    existingContent?: TMessageContentParts[],
  ): number => {
    /** Only apply -1 adjustment for TEXT or THINK types when they match existing content */
    if (
      initialContent.length > 0 &&
      (incomingContentType === ContentTypes.TEXT || incomingContentType === ContentTypes.THINK)
    ) {
      const targetIndex = baseIndex + initialContent.length - 1;
      const existingType = existingContent?.[targetIndex]?.type;
      if (existingType === incomingContentType) {
        return targetIndex;
      }
    }
    return baseIndex + initialContent.length;
  };

  const updateContent = (
    message: TMessage,
    index: number,
    contentPart: Agents.MessageContentComplex,
    finalUpdate = false,
  ) => {
    const contentType = contentPart.type ?? '';
    if (!contentType) {
      console.warn('No content type found in content part');
      return message;
    }

    const updatedContent = [...(message.content || [])] as Array<
      Partial<TMessageContentParts> | undefined
    >;
    if (!updatedContent[index]) {
      updatedContent[index] = { type: contentPart.type as AllContentTypes };
    }
    /** Prevent overwriting an existing content part with a different type */
    const existingType = (updatedContent[index]?.type as string | undefined) ?? '';
    if (existingType && !contentType.startsWith(existingType)) {
      console.warn('Content type mismatch');
      return message;
    }

    if (
      contentType.startsWith(ContentTypes.TEXT) &&
      ContentTypes.TEXT in contentPart &&
      typeof contentPart.text === 'string'
    ) {
      const currentContent = updatedContent[index] as MessageDeltaUpdate;
      const update: MessageDeltaUpdate = {
        type: ContentTypes.TEXT,
        text: (currentContent.text || '') + contentPart.text,
      };

      if (contentPart.tool_call_ids != null) {
        update.tool_call_ids = contentPart.tool_call_ids;
      }
      updatedContent[index] = update;
    } else if (
      contentType.startsWith(ContentTypes.AGENT_UPDATE) &&
      ContentTypes.AGENT_UPDATE in contentPart &&
      contentPart.agent_update
    ) {
      const update: Agents.AgentUpdate = {
        type: ContentTypes.AGENT_UPDATE,
        agent_update: contentPart.agent_update,
      };

      updatedContent[index] = update;
    } else if (
      contentType.startsWith(ContentTypes.THINK) &&
      ContentTypes.THINK in contentPart &&
      typeof contentPart.think === 'string'
    ) {
      const currentContent = updatedContent[index] as ReasoningDeltaUpdate;
      const update: ReasoningDeltaUpdate = {
        type: ContentTypes.THINK,
        think: (currentContent.think || '') + contentPart.think,
      };

      updatedContent[index] = update;
    } else if (contentType === ContentTypes.IMAGE_URL && 'image_url' in contentPart) {
      const currentContent = updatedContent[index] as {
        type: ContentTypes.IMAGE_URL;
        image_url: string;
      };
      updatedContent[index] = {
        ...currentContent,
      };
    } else if (contentType === ContentTypes.TOOL_CALL && 'tool_call' in contentPart) {
      const existingContent = updatedContent[index] as Agents.ToolCallContent | undefined;
      const existingToolCall = existingContent?.tool_call;
      const toolCallArgs = (contentPart.tool_call as Agents.ToolCall).args;
      /** When args are a valid object, they are likely already invoked */
      let args =
        finalUpdate ||
        typeof existingToolCall?.args === 'object' ||
        typeof toolCallArgs === 'object'
          ? contentPart.tool_call.args
          : (existingToolCall?.args ?? '') + (toolCallArgs ?? '');
      /** Preserve previously streamed args when final update omits them */
      if (finalUpdate && args == null && existingToolCall?.args != null) {
        args = existingToolCall.args;
      }

      const id = getNonEmptyValue([contentPart.tool_call.id, existingToolCall?.id]) ?? '';
      const name = getNonEmptyValue([contentPart.tool_call.name, existingToolCall?.name]) ?? '';

      const newToolCall: Agents.ToolCall & PartMetadata = {
        id,
        name,
        args,
        type: ToolCallTypes.TOOL_CALL,
        auth: contentPart.tool_call.auth,
        expires_at: contentPart.tool_call.expires_at,
      };

      if (finalUpdate) {
        newToolCall.progress = 1;
        newToolCall.output = contentPart.tool_call.output;
      }

      updatedContent[index] = {
        type: ContentTypes.TOOL_CALL,
        tool_call: newToolCall,
      };
    }

    return { ...message, content: updatedContent as TMessageContentParts[] };
  };

  const stepHandler = useCallback(
    ({ event, data }: TStepEvent, submission: EventSubmission) => {
      const messages = getMessages() || [];
      const { userMessage } = submission;
      setIsSubmitting(true);
      let parentMessageId = userMessage.messageId;

      const currentTime = Date.now();
      if (currentTime - lastAnnouncementTimeRef.current > MESSAGE_UPDATE_INTERVAL) {
        announcePolite({ message: 'composing', isStatus: true });
        lastAnnouncementTimeRef.current = currentTime;
      }

      let initialContent: TMessageContentParts[] = [];
      if (submission?.editedContent != null) {
        initialContent = submission?.initialResponse?.content ?? initialContent;
      }

      if (event === 'on_run_step') {
        const runStep = data as Agents.RunStep;
        let responseMessageId = runStep.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }
        if (!responseMessageId) {
          console.warn('No message id found in run step event');
          return;
        }

        stepMap.current.set(runStep.id, runStep);
        let response = messageMap.current.get(responseMessageId);

        if (!response) {
          const responseMessage = messages[messages.length - 1] as TMessage;

          response = {
            ...responseMessage,
            parentMessageId,
            conversationId: userMessage.conversationId,
            messageId: responseMessageId,
            content: initialContent,
          };

          messageMap.current.set(responseMessageId, response);
          setMessages([...messages.slice(0, -1), response]);
        }

        // Store tool call IDs if present
        if (runStep.stepDetails.type === StepTypes.TOOL_CALLS) {
          let updatedResponse = { ...response };
          (runStep.stepDetails.tool_calls as Agents.ToolCall[]).forEach((toolCall) => {
            const toolCallId = toolCall.id ?? '';
            if ('id' in toolCall && toolCallId) {
              toolCallIdMap.current.set(runStep.id, toolCallId);
            }

            const contentPart: Agents.MessageContentComplex = {
              type: ContentTypes.TOOL_CALL,
              tool_call: {
                name: toolCall.name ?? '',
                args: toolCall.args,
                id: toolCallId,
              },
            };

            /** Tool calls don't need index adjustment */
            const currentIndex = runStep.index + initialContent.length;
            updatedResponse = updateContent(updatedResponse, currentIndex, contentPart);
          });

          messageMap.current.set(responseMessageId, updatedResponse);
          const updatedMessages = messages.map((msg) =>
            msg.messageId === responseMessageId ? updatedResponse : msg,
          );

          setMessages(updatedMessages);
        }
      } else if (event === 'on_tool_result_delta') {
        const {
          user: _user,
          toolName: _toolName,
          toolId,
          progress,
          total,
          mimeType,
          isFinal,
          chunk,
        } = data as Agents.ToolCallResultDeltaEvent;

        // Find the message containing this tool call
        const currentMessages = getMessages() || [];
        let targetMessage: TMessage | undefined;
        let targetContentIndex = -1;

        for (const msg of currentMessages) {
          if (msg.content) {
            const index = msg.content.findIndex(
              (c) => c?.type === ContentTypes.TOOL_CALL && c.tool_call?.id === toolId,
            );
            if (index !== -1) {
              targetMessage = msg;
              targetContentIndex = index;
              break;
            }
          }
        }

        if (targetMessage && targetContentIndex !== -1) {
          const updatedMessage = { ...targetMessage };
          const updatedContent = [...(updatedMessage.content || [])] as TMessageContentParts[];
          const toolCallContent = updatedContent[targetContentIndex] as Agents.ToolCallContent;
          const existingToolCall = toolCallContent?.tool_call;

          // Create new streaming_data object (immutable update)
          const existingStreamingData = existingToolCall?.streaming_data || {
            chunks: [],
            progress,
            total,
            isComplete: false,
          };

          // Store chunks with their progress metadata for proper ordering
          // Each chunk is stored as an object with progress and data
          const newChunks = [...existingStreamingData.chunks];

          // Add the new chunk with its progress value
          const chunkEntry: ChunkEntry<string> = {
            progress: progress || 0,
            data: chunk,
            timestamp: Date.now(),
          };

          // Append the new chunk entry
          newChunks.push(chunkEntry);

          // Sort chunks by progress to maintain order
          // This ensures chunks are in the correct sequence even if they arrive out of order
          newChunks.sort((a, b) => {
            // First sort by progress if available
            if (a.progress !== b.progress) {
              return a.progress - b.progress;
            }
            // If progress is the same, sort by timestamp (order received)
            return a.timestamp - b.timestamp;
          });

          // Create new streaming_data object
          const newStreamingData: Agents.ToolCall['streaming_data'] = {
            mimeType,
            chunks: newChunks,
            progress,
            total,
            isComplete: isFinal || existingStreamingData.isComplete,
          };

          // Create new tool_call object with updated streaming_data
          let updatedToolCall: Agents.ToolCall = {
            ...existingToolCall,
            streaming_data: newStreamingData,
          } as Agents.ToolCall;

          // Update output if this is the final chunk
          if (isFinal) {
            // For other types, combine as before
            const combinedOutput = newChunks
              .filter((c: ChunkEntry<unknown>) => c && c.data !== undefined)
              .map((c: ChunkEntry<unknown>) => {
                const data = c.data;
                return typeof data === 'string' ? data : JSON.stringify(data);
              })
              .join('');

            updatedToolCall = {
              ...updatedToolCall,
              output: combinedOutput,
            };
          }

          // Create new ToolCallContent with updated tool_call
          const updatedToolCallContent: Agents.ToolCallContent = {
            ...toolCallContent,
            tool_call: updatedToolCall,
          };

          // Update the content array
          updatedContent[targetContentIndex] = updatedToolCallContent as TMessageContentParts;
          updatedMessage.content = updatedContent;

          // Update the message in the map and state
          if (updatedMessage.messageId) {
            messageMap.current.set(updatedMessage.messageId, updatedMessage);
          }

          const updatedMessages = currentMessages.map((msg) =>
            msg.messageId === updatedMessage.messageId ? updatedMessage : msg,
          );

          setMessages(updatedMessages);
        }
      } else if (event === 'on_agent_update') {
        const { agent_update } = data as Agents.AgentUpdate;
        let responseMessageId = agent_update.runId || '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }
        if (!responseMessageId) {
          console.warn('No message id found in agent update event');
          return;
        }

        const response = messageMap.current.get(responseMessageId);
        if (response) {
          // Agent updates don't need index adjustment
          const currentIndex = agent_update.index + initialContent.length;
          const updatedResponse = updateContent(response, currentIndex, data);
          messageMap.current.set(responseMessageId, updatedResponse);
          const currentMessages = getMessages() || [];
          setMessages([...currentMessages.slice(0, -1), updatedResponse]);
        }
      } else if (event === 'on_message_delta') {
        const messageDelta = data as Agents.MessageDeltaEvent;
        const runStep = stepMap.current.get(messageDelta.id);
        let responseMessageId = runStep?.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }

        if (!runStep || !responseMessageId) {
          console.warn('No run step or runId found for message delta event');
          return;
        }

        const response = messageMap.current.get(responseMessageId);
        if (response && messageDelta.delta.content) {
          const contentPart = Array.isArray(messageDelta.delta.content)
            ? messageDelta.delta.content[0]
            : messageDelta.delta.content;

          const currentIndex = calculateContentIndex(
            runStep.index,
            initialContent,
            contentPart.type || '',
            response.content,
          );
          const updatedResponse = updateContent(response, currentIndex, contentPart);

          messageMap.current.set(responseMessageId, updatedResponse);
          const currentMessages = getMessages() || [];
          setMessages([...currentMessages.slice(0, -1), updatedResponse]);
        }
      } else if (event === 'on_reasoning_delta') {
        const reasoningDelta = data as Agents.ReasoningDeltaEvent;
        const runStep = stepMap.current.get(reasoningDelta.id);
        let responseMessageId = runStep?.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }

        if (!runStep || !responseMessageId) {
          console.warn('No run step or runId found for reasoning delta event');
          return;
        }

        const response = messageMap.current.get(responseMessageId);
        if (response && reasoningDelta.delta.content != null) {
          const contentPart = Array.isArray(reasoningDelta.delta.content)
            ? reasoningDelta.delta.content[0]
            : reasoningDelta.delta.content;

          const currentIndex = calculateContentIndex(
            runStep.index,
            initialContent,
            contentPart.type || '',
            response.content,
          );
          const updatedResponse = updateContent(response, currentIndex, contentPart);

          messageMap.current.set(responseMessageId, updatedResponse);
          const currentMessages = getMessages() || [];
          setMessages([...currentMessages.slice(0, -1), updatedResponse]);
        }
      } else if (event === 'on_run_step_delta') {
        const runStepDelta = data as Agents.RunStepDeltaEvent;
        const runStep = stepMap.current.get(runStepDelta.id);
        let responseMessageId = runStep?.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }

        if (!runStep || !responseMessageId) {
          console.warn('No run step or runId found for run step delta event');
          return;
        }

        const response = messageMap.current.get(responseMessageId);
        if (
          response &&
          runStepDelta.delta.type === StepTypes.TOOL_CALLS &&
          runStepDelta.delta.tool_calls
        ) {
          let updatedResponse = { ...response };

          runStepDelta.delta.tool_calls.forEach((toolCallDelta) => {
            const toolCallId = toolCallIdMap.current.get(runStepDelta.id) ?? '';

            const contentPart: Agents.MessageContentComplex = {
              type: ContentTypes.TOOL_CALL,
              tool_call: {
                name: toolCallDelta.name ?? '',
                args: toolCallDelta.args ?? '',
                id: toolCallId,
              },
            };

            if (runStepDelta.delta.auth != null) {
              contentPart.tool_call.auth = runStepDelta.delta.auth;
              contentPart.tool_call.expires_at = runStepDelta.delta.expires_at;
            }

            /** Tool calls don't need index adjustment */
            const currentIndex = runStep.index + initialContent.length;
            updatedResponse = updateContent(updatedResponse, currentIndex, contentPart);
          });

          messageMap.current.set(responseMessageId, updatedResponse);
          const updatedMessages = messages.map((msg) =>
            msg.messageId === responseMessageId ? updatedResponse : msg,
          );

          setMessages(updatedMessages);
        }
      } else if (event === 'on_run_step_completed') {
        const { result } = data as unknown as { result: Agents.ToolEndEvent };

        const { id: stepId } = result;

        const runStep = stepMap.current.get(stepId);
        let responseMessageId = runStep?.runId ?? '';
        if (responseMessageId === Constants.USE_PRELIM_RESPONSE_MESSAGE_ID) {
          responseMessageId = submission?.initialResponse?.messageId ?? '';
          parentMessageId = submission?.initialResponse?.parentMessageId ?? '';
        }

        if (!runStep || !responseMessageId) {
          console.warn('No run step or runId found for completed tool call event');
          return;
        }

        const response = messageMap.current.get(responseMessageId);
        if (response) {
          let updatedResponse = { ...response };

          const contentPart: Agents.MessageContentComplex = {
            type: ContentTypes.TOOL_CALL,
            tool_call: result.tool_call,
          };

          /** Tool calls don't need index adjustment */
          const currentIndex = runStep.index + initialContent.length;
          updatedResponse = updateContent(updatedResponse, currentIndex, contentPart, true);

          messageMap.current.set(responseMessageId, updatedResponse);
          const updatedMessages = messages.map((msg) =>
            msg.messageId === responseMessageId ? updatedResponse : msg,
          );

          setMessages(updatedMessages);
        }
      }

      return () => {
        toolCallIdMap.current.clear();
        messageMap.current.clear();
        stepMap.current.clear();
      };
    },
    [getMessages, setIsSubmitting, lastAnnouncementTimeRef, announcePolite, setMessages],
  );

  const clearStepMaps = useCallback(() => {
    toolCallIdMap.current.clear();
    messageMap.current.clear();
    stepMap.current.clear();
  }, []);
  return { stepHandler, clearStepMaps };
}
