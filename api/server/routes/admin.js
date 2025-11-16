const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');
const { getConvosAdmin } = require('~/models/Conversation');
const { getMessages } = require('~/models/Message');
const { searchUsers } = require('~/models');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { checkAdmin } = require('~/server/middleware');

const router = express.Router();

// All routes require authentication and admin role
router.use(requireJwtAuth);
router.use(checkAdmin);

/**
 * Get all conversations with pagination and optional filters
 * Query params: cursor, limit, userId, search
 */
router.get('/conversations', async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 25;
  const cursor = req.query.cursor;
  const userId = req.query.userId;
  const search = req.query.search ? decodeURIComponent(req.query.search) : undefined;
  const order = req.query.order || 'desc';

  try {
    const result = await getConvosAdmin({
      cursor,
      limit,
      userId,
      search,
      order,
    });
    res.status(200).json(result);
  } catch (error) {
    logger.error('[Admin] Error fetching conversations', error);
    res.status(500).json({ error: 'Error fetching conversations' });
  }
});

/**
 * Get a single conversation with all messages
 * Params: conversationId
 */
router.get('/conversations/:conversationId', async (req, res) => {
  const { conversationId } = req.params;

  try {
    const { Conversation } = require('~/db/models');
    const conversation = await Conversation.findOne({ conversationId })
      .populate('user', 'email name username')
      .lean();

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messages = await getMessages({ conversationId });

    res.status(200).json({
      conversation,
      messages,
    });
  } catch (error) {
    logger.error('[Admin] Error fetching conversation', error);
    res.status(500).json({ error: 'Error fetching conversation' });
  }
});

/**
 * Search users by email, name, or username
 * Query params: q (search query), limit
 */
router.get('/users/search', async (req, res) => {
  const searchPattern = req.query.q;
  const limit = parseInt(req.query.limit, 10) || 20;

  try {
    if (!searchPattern || searchPattern.trim().length === 0) {
      return res.status(200).json([]);
    }

    const users = await searchUsers({
      searchPattern,
      limit,
      fieldsToSelect: '-password -totpSecret -backupCodes -refreshToken',
    });

    res.status(200).json(users);
  } catch (error) {
    logger.error('[Admin] Error searching users', error);
    res.status(500).json({ error: 'Error searching users' });
  }
});

module.exports = router;
