/**
 * User Service
 * Business logic layer for user operations
 */

const UserModel = require('../models/User');
const logger = require('../utils/logger');
const { metrics } = require('../utils/metrics');
const { Timer } = require('../utils/tracing');
const { ValidationError, NotFoundError, ConflictError } = require('../middleware/errorHandler');

class UserService {
  /**
   * Create a new user
   */
  async createUser(userData, context = {}) {
    const timer = new Timer('user_create', { request_id: context.requestId });

    try {
      // Validate required fields
      if (!userData.email || !userData.name) {
        throw new ValidationError('Email and name are required', {
          missing_fields: [
            !userData.email && 'email',
            !userData.name && 'name',
          ].filter(Boolean),
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(userData.email)) {
        throw new ValidationError('Invalid email format');
      }

      // Check if email already exists
      const existing = await UserModel.findByEmail(userData.email);
      if (existing) {
        throw new ConflictError('User with this email already exists');
      }

      timer.checkpoint('validation_complete');

      // Create user
      const user = await UserModel.create(userData);

      timer.checkpoint('user_created');

      // Log audit event
      logger.audit('USER_CREATED', context.userId || 'system', 'user', {
        new_user_id: user.id,
        email: user.email,
        request_id: context.requestId,
      });

      timer.end({ success: true, user_id: user.id });

      return user;
    } catch (error) {
      timer.end({ success: false, error: error.message });
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(id, context = {}) {
    const timer = new Timer('user_get_by_id', { request_id: context.requestId });

    try {
      const user = await UserModel.findById(id);

      if (!user) {
        throw new NotFoundError('User');
      }

      timer.end({ success: true, user_id: id });
      return user;
    } catch (error) {
      timer.end({ success: false, error: error.message });
      throw error;
    }
  }

  /**
   * Get all users with pagination and filters
   */
  async getUsers(options = {}, context = {}) {
    const timer = new Timer('user_list', { request_id: context.requestId });

    try {
      const { page = 1, limit = 10, status, role, search } = options;

      // Validate pagination
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

      timer.checkpoint('validation_complete');

      const result = await UserModel.findAll({
        page: pageNum,
        limit: limitNum,
        status,
        role,
        search,
      });

      timer.end({
        success: true,
        total: result.pagination.total,
        returned: result.data.length,
      });

      return result;
    } catch (error) {
      timer.end({ success: false, error: error.message });
      throw error;
    }
  }

  /**
   * Update user
   */
  async updateUser(id, updateData, context = {}) {
    const timer = new Timer('user_update', { request_id: context.requestId });

    try {
      // Validate email if provided
      if (updateData.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(updateData.email)) {
          throw new ValidationError('Invalid email format');
        }

        // Check if email is taken by another user
        const existing = await UserModel.findByEmail(updateData.email);
        if (existing && existing.id !== id) {
          throw new ConflictError('Email is already in use');
        }
      }

      // Validate role if provided
      const validRoles = ['user', 'admin', 'moderator'];
      if (updateData.role && !validRoles.includes(updateData.role)) {
        throw new ValidationError('Invalid role', {
          valid_roles: validRoles,
        });
      }

      // Validate status if provided
      const validStatuses = ['active', 'inactive', 'pending', 'suspended'];
      if (updateData.status && !validStatuses.includes(updateData.status)) {
        throw new ValidationError('Invalid status', {
          valid_statuses: validStatuses,
        });
      }

      timer.checkpoint('validation_complete');

      const user = await UserModel.update(id, updateData);

      if (!user) {
        throw new NotFoundError('User');
      }

      timer.checkpoint('user_updated');

      // Log audit event
      logger.audit('USER_UPDATED', context.userId || 'system', 'user', {
        user_id: id,
        updated_fields: Object.keys(updateData),
        request_id: context.requestId,
      });

      timer.end({ success: true, user_id: id });

      return user;
    } catch (error) {
      timer.end({ success: false, error: error.message });
      throw error;
    }
  }

  /**
   * Delete user
   */
  async deleteUser(id, context = {}) {
    const timer = new Timer('user_delete', { request_id: context.requestId });

    try {
      // Check if user exists
      const user = await UserModel.findById(id);
      if (!user) {
        throw new NotFoundError('User');
      }

      timer.checkpoint('user_found');

      const deleted = await UserModel.delete(id);

      if (!deleted) {
        throw new Error('Failed to delete user');
      }

      timer.checkpoint('user_deleted');

      // Log audit event
      logger.audit('USER_DELETED', context.userId || 'system', 'user', {
        deleted_user_id: id,
        deleted_email: user.email,
        request_id: context.requestId,
      });

      timer.end({ success: true, user_id: id });

      return { id, deleted: true };
    } catch (error) {
      timer.end({ success: false, error: error.message });
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  async getStatistics(context = {}) {
    const timer = new Timer('user_statistics', { request_id: context.requestId });

    try {
      const stats = await UserModel.getStats();
      timer.end({ success: true });
      return stats;
    } catch (error) {
      timer.end({ success: false, error: error.message });
      throw error;
    }
  }

  /**
   * Bulk operations
   */
  async bulkUpdateStatus(userIds, status, context = {}) {
    const timer = new Timer('user_bulk_update', { request_id: context.requestId });

    const results = {
      success: [],
      failed: [],
    };

    try {
      for (const id of userIds) {
        try {
          await UserModel.update(id, { status });
          results.success.push(id);
        } catch (err) {
          results.failed.push({ id, error: err.message });
        }
      }

      logger.audit('USER_BULK_UPDATE', context.userId || 'system', 'users', {
        total: userIds.length,
        success_count: results.success.length,
        failed_count: results.failed.length,
        request_id: context.requestId,
      });

      timer.end({
        success: true,
        total: userIds.length,
        updated: results.success.length,
      });

      return results;
    } catch (error) {
      timer.end({ success: false, error: error.message });
      throw error;
    }
  }
}

module.exports = new UserService();

