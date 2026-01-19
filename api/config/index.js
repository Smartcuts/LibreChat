const { EventSource } = require('eventsource');
const { MemorySaver } = require('@langchain/langgraph');
const { Time } = require('librechat-data-provider');
const { MCPManager, FlowStateManager, OAuthReconnectionManager } = require('@librechat/api');
const logger = require('./winston');

global.EventSource = EventSource;

/** @type {FlowStateManager} */
let flowManager = null;
/** @type {FlowStateManager} */
let userChoiceFlowManager = null;
/** @type {MemorySaver} */
let graphCheckpointer = null;

/**
 * @param {Keyv} flowsCache
 * @returns {FlowStateManager}
 */
function getFlowStateManager(flowsCache) {
  if (!flowManager) {
    flowManager = new FlowStateManager(flowsCache, {
      ttl: Time.ONE_MINUTE * 3,
    });
  }
  return flowManager;
}

/**
 * Get a FlowStateManager with extended TTL for user choice flows.
 * User choice flows need longer TTL since they wait for user interaction.
 * @param {Keyv} flowsCache
 * @returns {FlowStateManager}
 */
function getUserChoiceFlowManager(flowsCache) {
  if (!userChoiceFlowManager) {
    userChoiceFlowManager = new FlowStateManager(flowsCache, {
      ttl: Time.ONE_HOUR, // 1 hour TTL for user choice flows
    });
  }
  return userChoiceFlowManager;
}

/**
 * Get a shared MemorySaver checkpointer for LangGraph.
 * Used to enable graph interrupts and resumption for user_choice flows.
 * @returns {MemorySaver}
 */
function getGraphCheckpointer() {
  if (!graphCheckpointer) {
    graphCheckpointer = new MemorySaver();
  }
  return graphCheckpointer;
}

module.exports = {
  logger,
  createMCPManager: MCPManager.createInstance,
  getMCPManager: MCPManager.getInstance,
  getFlowStateManager,
  getUserChoiceFlowManager,
  getGraphCheckpointer,
  createOAuthReconnectionManager: OAuthReconnectionManager.createInstance,
  getOAuthReconnectionManager: OAuthReconnectionManager.getInstance,
};
