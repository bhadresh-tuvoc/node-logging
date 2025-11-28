/**
 * User Routes
 * API endpoints for user operations
 */

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { body, param, query } = require('express-validator');
const { ValidationError } = require('../middleware/errorHandler');

/**
 * Validation middleware factory
 */
const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map((validation) => validation.run(req)));

    const { validationResult } = require('express-validator');
    const errors = validationResult(req);

    if (errors.isEmpty()) {
      return next();
    }

    const extractedErrors = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
      value: err.value,
    }));

    throw new ValidationError('Validation failed', extractedErrors);
  };
};

/**
 * @route   GET /api/users/stats
 * @desc    Get user statistics
 */
router.get('/stats', userController.getStatistics);

/**
 * @route   GET /api/users
 * @desc    Get all users with pagination
 */
router.get(
  '/',
  validate([
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status').optional().isIn(['active', 'inactive', 'pending', 'suspended']),
    query('role').optional().isIn(['user', 'admin', 'moderator']),
    query('search').optional().isString().trim().isLength({ max: 100 }),
  ]),
  userController.getUsers
);

/**
 * @route   POST /api/users
 * @desc    Create a new user
 */
router.post(
  '/',
  validate([
    body('email')
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Invalid email format')
      .normalizeEmail(),
    body('name')
      .notEmpty()
      .withMessage('Name is required')
      .isString()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters'),
    body('role')
      .optional()
      .isIn(['user', 'admin', 'moderator'])
      .withMessage('Invalid role'),
    body('status')
      .optional()
      .isIn(['active', 'inactive', 'pending'])
      .withMessage('Invalid status'),
    body('metadata').optional().isObject(),
  ]),
  userController.createUser
);

/**
 * @route   POST /api/users/bulk/status
 * @desc    Bulk update user status
 */
router.post(
  '/bulk/status',
  validate([
    body('userIds')
      .isArray({ min: 1, max: 100 })
      .withMessage('userIds must be an array with 1-100 items'),
    body('userIds.*').isUUID().withMessage('Each userId must be a valid UUID'),
    body('status')
      .notEmpty()
      .isIn(['active', 'inactive', 'pending', 'suspended'])
      .withMessage('Invalid status'),
  ]),
  userController.bulkUpdateStatus
);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 */
router.get(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid user ID format')]),
  userController.getUserById
);

/**
 * @route   PUT /api/users/:id
 * @desc    Update user
 */
router.put(
  '/:id',
  validate([
    param('id').isUUID().withMessage('Invalid user ID format'),
    body('email').optional().isEmail().withMessage('Invalid email format').normalizeEmail(),
    body('name')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters'),
    body('role')
      .optional()
      .isIn(['user', 'admin', 'moderator'])
      .withMessage('Invalid role'),
    body('status')
      .optional()
      .isIn(['active', 'inactive', 'pending', 'suspended'])
      .withMessage('Invalid status'),
    body('metadata').optional().isObject(),
  ]),
  userController.updateUser
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user
 */
router.delete(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid user ID format')]),
  userController.deleteUser
);

module.exports = router;

