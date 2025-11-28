/**
 * Security Middleware
 * Production security configurations
 */

const helmet = require('helmet');
const cors = require('cors');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Helmet Security Configuration
 */
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: 'same-site' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
});

/**
 * CORS Configuration
 */
const corsConfig = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:3000', 'http://localhost:3001'];

    if (allowedOrigins.includes(origin) || config.app.isDevelopment) {
      callback(null, true);
    } else {
      logger.security('CORS blocked request', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Trace-ID'],
  exposedHeaders: ['X-Request-ID', 'X-Trace-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  maxAge: 86400, // 24 hours
});

/**
 * Simple Rate Limiter (in-memory, for demo)
 * In production, use Redis-based rate limiting
 */
const rateLimitStore = new Map();

const rateLimiter = (options = {}) => {
  const windowMs = options.windowMs || config.rateLimit.windowMs;
  const maxRequests = options.maxRequests || config.rateLimit.maxRequests;

  // Cleanup old entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
      if (now - data.windowStart > windowMs) {
        rateLimitStore.delete(key);
      }
    }
  }, 60000);

  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress;
    const now = Date.now();

    let rateData = rateLimitStore.get(key);

    if (!rateData || now - rateData.windowStart > windowMs) {
      rateData = {
        count: 0,
        windowStart: now,
      };
    }

    rateData.count++;
    rateLimitStore.set(key, rateData);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - rateData.count));
    res.setHeader('X-RateLimit-Reset', new Date(rateData.windowStart + windowMs).toISOString());

    if (rateData.count > maxRequests) {
      logger.security('Rate limit exceeded', {
        ip: key,
        count: rateData.count,
        limit: maxRequests,
        path: req.path,
      });

      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
        },
        meta: {
          request_id: req.requestId,
          retry_after: Math.ceil((rateData.windowStart + windowMs - now) / 1000),
        },
      });
    }

    next();
  };
};

/**
 * Request Sanitizer
 */
const sanitizeRequest = (req, res, next) => {
  // Remove any null bytes from request parameters
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      return obj.replace(/\0/g, '');
    }
    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        obj[key] = sanitize(obj[key]);
      }
    }
    return obj;
  };

  if (req.body) req.body = sanitize(req.body);
  if (req.query) req.query = sanitize(req.query);
  if (req.params) req.params = sanitize(req.params);

  next();
};

module.exports = {
  helmetConfig,
  corsConfig,
  rateLimiter,
  sanitizeRequest,
};

