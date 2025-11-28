/**
 * User Model
 * In-memory data store for demo purposes
 * In production, replace with actual database (PostgreSQL, MongoDB, etc.)
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { metrics, trackDbQuery } = require('../utils/metrics');
const config = require('../config');

// In-memory store (simulates database)
const users = new Map();

// Simulated database latency
const simulateDbLatency = async () => {
  const latency = config.database.latencyMs + Math.random() * 20;
  await new Promise((resolve) => setTimeout(resolve, latency));

  // Simulate random database errors
  if (Math.random() < config.database.errorRate) {
    throw new Error('Database connection timeout');
  }
};

/**
 * User Schema/Structure
 */
const createUserObject = (data) => {
  const now = new Date().toISOString();
  return {
    id: data.id || uuidv4(),
    email: data.email.toLowerCase().trim(),
    name: data.name.trim(),
    role: data.role || 'user',
    status: data.status || 'active',
    metadata: data.metadata || {},
    createdAt: data.createdAt || now,
    updatedAt: now,
  };
};

/**
 * User Model Operations
 */
const UserModel = {
  /**
   * Create a new user
   */
  async create(userData) {
    return trackDbQuery('INSERT', 'users', async () => {
      await simulateDbLatency();

      // Check for duplicate email
      for (const user of users.values()) {
        if (user.email === userData.email.toLowerCase()) {
          throw new Error('Email already exists');
        }
      }

      const user = createUserObject(userData);
      users.set(user.id, user);

      logger.debug('User created in database', {
        user_id: user.id,
        email: user.email,
      });

      metrics.userOperations.labels('create', 'success').inc();
      return { ...user };
    });
  },

  /**
   * Find user by ID
   */
  async findById(id) {
    return trackDbQuery('SELECT', 'users', async () => {
      await simulateDbLatency();

      const user = users.get(id);
      if (!user) {
        return null;
      }

      return { ...user };
    });
  },

  /**
   * Find user by email
   */
  async findByEmail(email) {
    return trackDbQuery('SELECT', 'users', async () => {
      await simulateDbLatency();

      for (const user of users.values()) {
        if (user.email === email.toLowerCase()) {
          return { ...user };
        }
      }
      return null;
    });
  },

  /**
   * Find all users with pagination
   */
  async findAll(options = {}) {
    return trackDbQuery('SELECT', 'users', async () => {
      await simulateDbLatency();

      const { page = 1, limit = 10, status, role, search } = options;

      let results = Array.from(users.values());

      // Apply filters
      if (status) {
        results = results.filter((u) => u.status === status);
      }
      if (role) {
        results = results.filter((u) => u.role === role);
      }
      if (search) {
        const searchLower = search.toLowerCase();
        results = results.filter(
          (u) =>
            u.name.toLowerCase().includes(searchLower) ||
            u.email.toLowerCase().includes(searchLower)
        );
      }

      // Sort by createdAt descending
      results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Calculate pagination
      const total = results.length;
      const totalPages = Math.ceil(total / limit);
      const offset = (page - 1) * limit;

      results = results.slice(offset, offset + limit);

      return {
        data: results.map((u) => ({ ...u })),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    });
  },

  /**
   * Update user
   */
  async update(id, updateData) {
    return trackDbQuery('UPDATE', 'users', async () => {
      await simulateDbLatency();

      const user = users.get(id);
      if (!user) {
        return null;
      }

      // Check email uniqueness if being updated
      if (updateData.email && updateData.email.toLowerCase() !== user.email) {
        for (const u of users.values()) {
          if (u.email === updateData.email.toLowerCase() && u.id !== id) {
            throw new Error('Email already exists');
          }
        }
      }

      const updatedUser = {
        ...user,
        ...updateData,
        id: user.id, // Prevent ID change
        createdAt: user.createdAt, // Prevent creation date change
        updatedAt: new Date().toISOString(),
      };

      if (updatedUser.email) {
        updatedUser.email = updatedUser.email.toLowerCase().trim();
      }
      if (updatedUser.name) {
        updatedUser.name = updatedUser.name.trim();
      }

      users.set(id, updatedUser);

      logger.debug('User updated in database', {
        user_id: id,
        fields_updated: Object.keys(updateData),
      });

      metrics.userOperations.labels('update', 'success').inc();
      return { ...updatedUser };
    });
  },

  /**
   * Delete user
   */
  async delete(id) {
    return trackDbQuery('DELETE', 'users', async () => {
      await simulateDbLatency();

      const user = users.get(id);
      if (!user) {
        return false;
      }

      users.delete(id);

      logger.debug('User deleted from database', {
        user_id: id,
      });

      metrics.userOperations.labels('delete', 'success').inc();
      return true;
    });
  },

  /**
   * Count users
   */
  async count(filters = {}) {
    return trackDbQuery('COUNT', 'users', async () => {
      await simulateDbLatency();

      let count = 0;
      for (const user of users.values()) {
        let matches = true;
        if (filters.status && user.status !== filters.status) matches = false;
        if (filters.role && user.role !== filters.role) matches = false;
        if (matches) count++;
      }

      return count;
    });
  },

  /**
   * Get statistics
   */
  async getStats() {
    return trackDbQuery('AGGREGATE', 'users', async () => {
      await simulateDbLatency();

      const stats = {
        total: users.size,
        byStatus: {},
        byRole: {},
        recentlyCreated: 0,
      };

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      for (const user of users.values()) {
        stats.byStatus[user.status] = (stats.byStatus[user.status] || 0) + 1;
        stats.byRole[user.role] = (stats.byRole[user.role] || 0) + 1;

        if (new Date(user.createdAt) > oneDayAgo) {
          stats.recentlyCreated++;
        }
      }

      return stats;
    });
  },

  /**
   * Clear all users (for testing)
   */
  async clear() {
    users.clear();
    logger.info('All users cleared from database');
  },

  /**
   * Seed sample data
   */
  async seed(count = 10) {
    const roles = ['user', 'admin', 'moderator'];
    const statuses = ['active', 'inactive', 'pending'];

    for (let i = 0; i < count; i++) {
      await this.create({
        email: `user${i + 1}@example.com`,
        name: `Test User ${i + 1}`,
        role: roles[Math.floor(Math.random() * roles.length)],
        status: statuses[Math.floor(Math.random() * statuses.length)],
      });
    }

    logger.info(`Seeded ${count} users into database`);
  },
};

module.exports = UserModel;

