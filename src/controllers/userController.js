/**
 * User Controller
 * HTTP request handlers for user endpoints
 */

const userService = require('../services/userService');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * @route   POST /api/users
 * @desc    Create a new user
 * @access  Public
 */
const createUser = asyncHandler(async (req, res) => {
  const { email, name, role, status, metadata } = req.body;

  const context = {
    requestId: req.requestId,
    userId: req.user?.id,
  };

  const user = await userService.createUser(
    { email, name, role, status, metadata },
    context
  );

  req.logger.info('User created successfully', {
    user_id: user.id,
    email: user.email,
  });

  res.status(201).json({
    success: true,
    data: user,
    meta: {
      request_id: req.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Public
 */
const getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const context = {
    requestId: req.requestId,
    userId: req.user?.id,
  };

  const user = await userService.getUserById(id, context);

  res.json({
    success: true,
    data: user,
    meta: {
      request_id: req.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * @route   GET /api/users
 * @desc    Get all users with pagination
 * @access  Public
 */
const getUsers = asyncHandler(async (req, res) => {
  const { page, limit, status, role, search } = req.query;

  const context = {
    requestId: req.requestId,
    userId: req.user?.id,
  };

  const result = await userService.getUsers(
    { page, limit, status, role, search },
    context
  );

  res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
    meta: {
      request_id: req.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * @route   PUT /api/users/:id
 * @desc    Update user
 * @access  Public
 */
const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { email, name, role, status, metadata } = req.body;

  const context = {
    requestId: req.requestId,
    userId: req.user?.id,
  };

  // Build update object with only provided fields
  const updateData = {};
  if (email !== undefined) updateData.email = email;
  if (name !== undefined) updateData.name = name;
  if (role !== undefined) updateData.role = role;
  if (status !== undefined) updateData.status = status;
  if (metadata !== undefined) updateData.metadata = metadata;

  const user = await userService.updateUser(id, updateData, context);

  req.logger.info('User updated successfully', {
    user_id: user.id,
    updated_fields: Object.keys(updateData),
  });

  res.json({
    success: true,
    data: user,
    meta: {
      request_id: req.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user
 * @access  Public
 */
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const context = {
    requestId: req.requestId,
    userId: req.user?.id,
  };

  await userService.deleteUser(id, context);

  req.logger.info('User deleted successfully', { user_id: id });

  res.json({
    success: true,
    data: { id, deleted: true },
    meta: {
      request_id: req.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * @route   GET /api/users/stats
 * @desc    Get user statistics
 * @access  Public
 */
const getStatistics = asyncHandler(async (req, res) => {
  const context = {
    requestId: req.requestId,
    userId: req.user?.id,
  };

  const stats = await userService.getStatistics(context);

  res.json({
    success: true,
    data: stats,
    meta: {
      request_id: req.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * @route   POST /api/users/bulk/status
 * @desc    Bulk update user status
 * @access  Public
 */
const bulkUpdateStatus = asyncHandler(async (req, res) => {
  const { userIds, status } = req.body;

  const context = {
    requestId: req.requestId,
    userId: req.user?.id,
  };

  const result = await userService.bulkUpdateStatus(userIds, status, context);

  req.logger.info('Bulk status update completed', {
    total: userIds.length,
    success: result.success.length,
    failed: result.failed.length,
  });

  res.json({
    success: true,
    data: result,
    meta: {
      request_id: req.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = {
  createUser,
  getUserById,
  getUsers,
  updateUser,
  deleteUser,
  getStatistics,
  bulkUpdateStatus,
};

