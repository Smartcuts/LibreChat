const { nanoid } = require('nanoid');
const { sendEvent } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { Tools, StepTypes, FileContext, ErrorTypes } = require('librechat-data-provider');
const {
  EnvVar,
  Providers,
  GraphEvents,
  getMessageId,
  ToolEndHandler,
  handleToolCalls,
  ChatModelStreamHandler,
} = require('@librechat/agents');
const { processFileCitations } = require('~/server/services/Files/Citations');
const { processCodeOutput } = require('~/server/services/Files/Code/process');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { saveBase64Image } = require('~/server/services/Files/process');

class ModelEndHandler {
  /**
   * @param {Array<UsageMetadata>} collectedUsage
   */
  constructor(collectedUsage) {
    if (!Array.isArray(collectedUsage)) {
      throw new Error('collectedUsage must be an array');
    }
    this.collectedUsage = collectedUsage;
  }

  finalize(errorMessage) {
    if (!errorMessage) {
      return;
    }
    throw new Error(errorMessage);
  }

  /**
   * @param {string} event
   * @param {ModelEndData | undefined} data
   * @param {Record<string, unknown> | undefined} metadata
   * @param {StandardGraph} graph
   * @returns
   */
  handle(event, data, metadata, graph) {
    if (!graph || !metadata) {
      console.warn(`Graph or metadata not found in ${event} event`);
      return;
    }

    /** @type {string | undefined} */
    let errorMessage;
    try {
      const agentContext = graph.getAgentContext(metadata);
      const isGoogle = agentContext.provider === Providers.GOOGLE;
      const streamingDisabled = !!agentContext.clientOptions?.disableStreaming;
      if (data?.output?.additional_kwargs?.stop_reason === 'refusal') {
        const info = { ...data.output.additional_kwargs };
        errorMessage = JSON.stringify({
          type: ErrorTypes.REFUSAL,
          info,
        });
        logger.debug(`[ModelEndHandler] Model refused to respond`, {
          ...info,
          userId: metadata.user_id,
          messageId: metadata.run_id,
          conversationId: metadata.thread_id,
        });
      }

      const toolCalls = data?.output?.tool_calls;
      let hasUnprocessedToolCalls = false;
      if (Array.isArray(toolCalls) && toolCalls.length > 0 && graph?.toolCallStepIds?.has) {
        try {
          hasUnprocessedToolCalls = toolCalls.some(
            (tc) => tc?.id && !graph.toolCallStepIds.has(tc.id),
          );
        } catch {
          hasUnprocessedToolCalls = false;
        }
      }
      if (isGoogle || streamingDisabled || hasUnprocessedToolCalls) {
        handleToolCalls(toolCalls, metadata, graph);
      }

      const usage = data?.output?.usage_metadata;
      if (!usage) {
        return this.finalize(errorMessage);
      }
      const modelName = metadata?.ls_model_name || agentContext.clientOptions?.model;
      if (modelName) {
        usage.model = modelName;
      }

      this.collectedUsage.push(usage);
      if (!streamingDisabled) {
        return this.finalize(errorMessage);
      }
      if (!data.output.content) {
        return this.finalize(errorMessage);
      }
      const stepKey = graph.getStepKey(metadata);
      const message_id = getMessageId(stepKey, graph) ?? '';
      if (message_id) {
        graph.dispatchRunStep(stepKey, {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: {
            message_id,
          },
        });
      }
      const stepId = graph.getStepIdByKey(stepKey);
      const content = data.output.content;
      if (typeof content === 'string') {
        graph.dispatchMessageDelta(stepId, {
          content: [
            {
              type: 'text',
              text: content,
            },
          ],
        });
      } else if (content.every((c) => c.type?.startsWith('text'))) {
        graph.dispatchMessageDelta(stepId, {
          content,
        });
      }
    } catch (error) {
      logger.error('Error handling model end event:', error);
      return this.finalize(errorMessage);
    }
  }
}

/**
 * @deprecated Agent Chain helper
 * @param {string | undefined} [last_agent_id]
 * @param {string | undefined} [langgraph_node]
 * @returns {boolean}
 */
function checkIfLastAgent(last_agent_id, langgraph_node) {
  if (!last_agent_id || !langgraph_node) {
    return false;
  }
  return langgraph_node?.endsWith(last_agent_id);
}

/**
 * StreamingToolEndHandler - Extends ToolEndHandler to provide streaming progress updates
 */
class StreamingToolEndHandler {
  /**
   * @param {ServerResponse} res - The response object for sending events
   * @param {ToolEndCallback} toolEndCallback - Callback to use when tool ends
   * @param {(name?: string) => boolean} omitOutput - Function to determine if output should be omitted
   */
  constructor(res, toolEndCallback, omitOutput) {
    this.res = res;
    this.toolEndCallback = toolEndCallback;
    this.omitOutput = omitOutput;
    this.toolProgressMap = new Map();

    // Create the actual ToolEndHandler instance
    this.toolEndHandler = new ToolEndHandler(toolEndCallback, omitOutput);
  }

  /**
   * Handle tool end event with streaming support
   * @param {string} event - The event name
   * @param {StreamEventData | undefined} data - The event data
   * @param {Record<string, unknown>} metadata - The metadata
   * @param {StandardGraph} graph - The graph instance
   */
  handle(event, data, metadata, graph) {
    if (!graph || !metadata) {
      console.warn(`Graph or metadata not found in ${event} event`);
      return;
    }

    const toolEndData = data;
    if (!toolEndData?.output) {
      console.warn('No output found in tool_end event');
      return;
    }

    const toolName = toolEndData.output.name;
    const toolId = this.generateToolId(toolName, metadata);

    try {
      // Send initial progress event if this is a new tool
      if (!this.toolProgressMap.has(toolId)) {
        this.sendProgressEvent(toolId, toolName, 0.1, false);
        this.toolProgressMap.set(toolId, {
          startTime: Date.now(),
          progressTimer: this.startProgressSimulation(toolId, toolName),
        });
      }

      // Call the original ToolEndHandler
      this.toolEndHandler.handle(event, data, metadata, graph);

      // Send completion event with the actual tool output
      const toolData = this.toolProgressMap.get(toolId);
      if (toolData) {
        clearInterval(toolData.progressTimer);
        this.toolProgressMap.delete(toolId);
      }

      this.sendProgressEvent(toolId, toolName, 1.0, true, toolEndData.output);
    } catch (error) {
      // Clean up progress tracking on error
      const toolData = this.toolProgressMap.get(toolId);
      if (toolData) {
        clearInterval(toolData.progressTimer);
        this.toolProgressMap.delete(toolId);
      }
      throw error;
    }
  }

  /**
   * Generate a unique tool ID for progress tracking
   * @param {string} toolName - The tool name
   * @param {Record<string, unknown>} metadata - The metadata
   * @returns {string} - Unique tool ID
   */
  generateToolId(toolName, metadata) {
    const runId = metadata.run_id || 'unknown';
    const agentId = metadata.agent_id || 'unknown';
    const timestamp = Date.now();
    return `${runId}-${agentId}-${toolName}-${timestamp}`;
  }

  /**
   * Start simulated progress updates for a tool
   * @param {string} toolId - The tool ID
   * @param {string} toolName - The tool name
   * @returns {NodeJS.Timeout} - The interval timer
   */
  startProgressSimulation(toolId, toolName) {
    let currentProgress = 0.1;
    const progressSteps = [0.3, 0.5, 0.7, 0.9];
    let stepIndex = 0;

    return setInterval(() => {
      if (stepIndex < progressSteps.length && this.toolProgressMap.has(toolId)) {
        currentProgress = progressSteps[stepIndex];
        this.sendProgressEvent(toolId, toolName, currentProgress, false);
        stepIndex++;
      } else {
        // Clear interval if we've sent all progress steps
        const toolData = this.toolProgressMap.get(toolId);
        if (toolData) {
          clearInterval(toolData.progressTimer);
        }
      }
    }, 800); // Send progress update every 800ms
  }

  /**
   * Send progress event to the frontend
   * @param {string} toolId - The tool ID
   * @param {string} toolName - The tool name
   * @param {number} progress - Progress value (0-1)
   * @param {boolean} isFinal - Whether this is the final update
   * @param {any} output - The tool output (for final update)
   */
  sendProgressEvent(toolId, toolName, progress, isFinal, output) {
    try {
      /** @type {ToolCallResultDeltaEvent} */
      const eventData = {
        toolId,
        toolName,
        progress,
        total: 1.0,
        isFinal,
        chunk: output ? JSON.stringify(output) : '',
        streamMode: 'append',
        mimeType: this.detectMimeType(output),
      };

      sendEvent(this.res, {
        event: 'on_tool_result_delta',
        data: eventData,
      });
    } catch (error) {
      logger.error(`Error sending progress event for tool ${toolName}:`, error);
    }
  }

  /**
   * Detect MIME type from tool output
   * @param {any} output - The tool output
   * @returns {string} - The detected MIME type
   */
  detectMimeType(output) {
    if (!output) {
      return 'text/plain';
    }

    const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

    try {
      const parsed = JSON.parse(outputStr);

      // Check for CSV data indicators
      if (
        parsed.csv_data ||
        parsed.file?.filename?.endsWith('.csv') ||
        parsed.mimeType === 'text/csv'
      ) {
        return 'text/csv';
      }

      // Default to JSON for structured data
      return 'application/json';
    } catch {
      // Check for raw CSV format
      if (typeof output === 'string' && output.includes(',') && output.includes('\n')) {
        const lines = output.split('\n').filter((line) => line.trim());
        if (lines.length > 1) {
          const firstLineCommas = (lines[0].match(/,/g) || []).length;
          const secondLineCommas = (lines[1].match(/,/g) || []).length;
          if (firstLineCommas > 0 && Math.abs(firstLineCommas - secondLineCommas) <= 1) {
            return 'text/csv';
          }
        }
      }

      return 'text/plain';
    }
  }
}

/**
 * Get default handlers for stream events.
 * @param {Object} options - The options object.
 * @param {ServerResponse} options.res - The options object.
 * @param {ContentAggregator} options.aggregateContent - The options object.
 * @param {ToolEndCallback} options.toolEndCallback - Callback to use when tool ends.
 * @param {Array<UsageMetadata>} options.collectedUsage - The list of collected usage metadata.
 * @returns {Record<string, t.EventHandler>} The default handlers.
 * @throws {Error} If the request is not found.
 */
function getDefaultHandlers({ res, aggregateContent, toolEndCallback, collectedUsage }) {
  if (!res || !aggregateContent) {
    throw new Error(
      `[getDefaultHandlers] Missing required options: res: ${!res}, aggregateContent: ${!aggregateContent}`,
    );
  }
  const handlers = {
    [GraphEvents.CHAT_MODEL_END]: new ModelEndHandler(collectedUsage),
    [GraphEvents.TOOL_END]: new StreamingToolEndHandler(res, toolEndCallback),
    [GraphEvents.CHAT_MODEL_STREAM]: new ChatModelStreamHandler(),
    [GraphEvents.ON_RUN_STEP]: {
      /**
       * Handle ON_RUN_STEP event.
       * @param {string} event - The event name.
       * @param {StreamEventData} data - The event data.
       * @param {GraphRunnableConfig['configurable']} [metadata] The runnable metadata.
       */
      handle: (event, data, metadata) => {
        if (data?.stepDetails.type === StepTypes.TOOL_CALLS) {
          sendEvent(res, { event, data });
        } else if (checkIfLastAgent(metadata?.last_agent_id, metadata?.langgraph_node)) {
          sendEvent(res, { event, data });
        } else if (!metadata?.hide_sequential_outputs) {
          sendEvent(res, { event, data });
        } else {
          const agentName = metadata?.name ?? 'Agent';
          const isToolCall = data?.stepDetails.type === StepTypes.TOOL_CALLS;
          const action = isToolCall ? 'performing a task...' : 'thinking...';
          sendEvent(res, {
            event: 'on_agent_update',
            data: {
              runId: metadata?.run_id,
              message: `${agentName} is ${action}`,
            },
          });
        }
        aggregateContent({ event, data });
      },
    },
    [GraphEvents.ON_RUN_STEP_DELTA]: {
      /**
       * Handle ON_RUN_STEP_DELTA event.
       * @param {string} event - The event name.
       * @param {StreamEventData} data - The event data.
       * @param {GraphRunnableConfig['configurable']} [metadata] The runnable metadata.
       */
      handle: (event, data, metadata) => {
        if (data?.delta.type === StepTypes.TOOL_CALLS) {
          sendEvent(res, { event, data });
        } else if (checkIfLastAgent(metadata?.last_agent_id, metadata?.langgraph_node)) {
          sendEvent(res, { event, data });
        } else if (!metadata?.hide_sequential_outputs) {
          sendEvent(res, { event, data });
        }
        aggregateContent({ event, data });
      },
    },
    [GraphEvents.ON_RUN_STEP_COMPLETED]: {
      /**
       * Handle ON_RUN_STEP_COMPLETED event.
       * @param {string} event - The event name.
       * @param {StreamEventData & { result: ToolEndData }} data - The event data.
       * @param {GraphRunnableConfig['configurable']} [metadata] The runnable metadata.
       */
      handle: (event, data, metadata) => {
        if (data?.result != null) {
          sendEvent(res, { event, data });
        } else if (checkIfLastAgent(metadata?.last_agent_id, metadata?.langgraph_node)) {
          sendEvent(res, { event, data });
        } else if (!metadata?.hide_sequential_outputs) {
          sendEvent(res, { event, data });
        }
        aggregateContent({ event, data });
      },
    },
    [GraphEvents.ON_MESSAGE_DELTA]: {
      /**
       * Handle ON_MESSAGE_DELTA event.
       * @param {string} event - The event name.
       * @param {StreamEventData} data - The event data.
       * @param {GraphRunnableConfig['configurable']} [metadata] The runnable metadata.
       */
      handle: (event, data, metadata) => {
        if (checkIfLastAgent(metadata?.last_agent_id, metadata?.langgraph_node)) {
          sendEvent(res, { event, data });
        } else if (!metadata?.hide_sequential_outputs) {
          sendEvent(res, { event, data });
        }
        aggregateContent({ event, data });
      },
    },
    [GraphEvents.ON_REASONING_DELTA]: {
      /**
       * Handle ON_REASONING_DELTA event.
       * @param {string} event - The event name.
       * @param {StreamEventData} data - The event data.
       * @param {GraphRunnableConfig['configurable']} [metadata] The runnable metadata.
       */
      handle: (event, data, metadata) => {
        if (checkIfLastAgent(metadata?.last_agent_id, metadata?.langgraph_node)) {
          sendEvent(res, { event, data });
        } else if (!metadata?.hide_sequential_outputs) {
          sendEvent(res, { event, data });
        }
        aggregateContent({ event, data });
      },
    },
  };

  return handlers;
}

/**
 *
 * @param {Object} params
 * @param {ServerRequest} params.req
 * @param {ServerResponse} params.res
 * @param {Promise<MongoFile | { filename: string; filepath: string; expires: number;} | null>[]} params.artifactPromises
 * @returns {ToolEndCallback} The tool end callback.
 */
function createToolEndCallback({ req, res, artifactPromises }) {
  /**
   * @type {ToolEndCallback}
   */
  return async (data, metadata) => {
    const output = data?.output;
    if (!output) {
      return;
    }

    if (!output.artifact) {
      return;
    }

    if (output.artifact[Tools.file_search]) {
      artifactPromises.push(
        (async () => {
          const user = req.user;
          const attachment = await processFileCitations({
            user,
            metadata,
            appConfig: req.config,
            toolArtifact: output.artifact,
            toolCallId: output.tool_call_id,
          });
          if (!attachment) {
            return null;
          }
          if (!res.headersSent) {
            return attachment;
          }
          res.write(`event: attachment\ndata: ${JSON.stringify(attachment)}\n\n`);
          return attachment;
        })().catch((error) => {
          logger.error('Error processing file citations:', error);
          return null;
        }),
      );
    }

    // TODO: a lot of duplicated code in createToolEndCallback
    // we should refactor this to use a helper function in a follow-up PR
    if (output.artifact[Tools.ui_resources]) {
      artifactPromises.push(
        (async () => {
          const attachment = {
            type: Tools.ui_resources,
            messageId: metadata.run_id,
            toolCallId: output.tool_call_id,
            conversationId: metadata.thread_id,
            [Tools.ui_resources]: output.artifact[Tools.ui_resources].data,
          };
          if (!res.headersSent) {
            return attachment;
          }
          res.write(`event: attachment\ndata: ${JSON.stringify(attachment)}\n\n`);
          return attachment;
        })().catch((error) => {
          logger.error('Error processing artifact content:', error);
          return null;
        }),
      );
    }

    if (output.artifact[Tools.web_search]) {
      artifactPromises.push(
        (async () => {
          const attachment = {
            type: Tools.web_search,
            messageId: metadata.run_id,
            toolCallId: output.tool_call_id,
            conversationId: metadata.thread_id,
            [Tools.web_search]: { ...output.artifact[Tools.web_search] },
          };
          if (!res.headersSent) {
            return attachment;
          }
          res.write(`event: attachment\ndata: ${JSON.stringify(attachment)}\n\n`);
          return attachment;
        })().catch((error) => {
          logger.error('Error processing artifact content:', error);
          return null;
        }),
      );
    }

    if (output.artifact.content) {
      /** @type {FormattedContent[]} */
      const content = output.artifact.content;
      for (let i = 0; i < content.length; i++) {
        const part = content[i];
        if (!part) {
          continue;
        }
        if (part.type !== 'image_url') {
          continue;
        }
        const { url } = part.image_url;
        artifactPromises.push(
          (async () => {
            const filename = `${output.name}_${output.tool_call_id}_img_${nanoid()}`;
            const file_id = output.artifact.file_ids?.[i];
            const file = await saveBase64Image(url, {
              req,
              file_id,
              filename,
              endpoint: metadata.provider,
              context: FileContext.image_generation,
            });
            const fileMetadata = Object.assign(file, {
              messageId: metadata.run_id,
              toolCallId: output.tool_call_id,
              conversationId: metadata.thread_id,
            });
            if (!res.headersSent) {
              return fileMetadata;
            }

            if (!fileMetadata) {
              return null;
            }

            res.write(`event: attachment\ndata: ${JSON.stringify(fileMetadata)}\n\n`);
            return fileMetadata;
          })().catch((error) => {
            logger.error('Error processing artifact content:', error);
            return null;
          }),
        );
      }
      return;
    }

    {
      if (output.name !== Tools.execute_code) {
        return;
      }
    }

    if (!output.artifact.files) {
      return;
    }

    for (const file of output.artifact.files) {
      const { id, name } = file;
      artifactPromises.push(
        (async () => {
          const result = await loadAuthValues({
            userId: req.user.id,
            authFields: [EnvVar.CODE_API_KEY],
          });
          const fileMetadata = await processCodeOutput({
            req,
            id,
            name,
            apiKey: result[EnvVar.CODE_API_KEY],
            messageId: metadata.run_id,
            toolCallId: output.tool_call_id,
            conversationId: metadata.thread_id,
            session_id: output.artifact.session_id,
          });
          if (!res.headersSent) {
            return fileMetadata;
          }

          if (!fileMetadata) {
            return null;
          }

          res.write(`event: attachment\ndata: ${JSON.stringify(fileMetadata)}\n\n`);
          return fileMetadata;
        })().catch((error) => {
          logger.error('Error processing code output:', error);
          return null;
        }),
      );
    }
  };
}

module.exports = {
  getDefaultHandlers,
  createToolEndCallback,
};
