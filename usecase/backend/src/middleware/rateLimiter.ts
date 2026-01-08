import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

// Configuration
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'); // 1 minute
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100');

export const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  // Get client identifier (IP or API key)
  const clientId = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
  
  const now = Date.now();
  
  // Initialize or reset if window expired
  if (!store[clientId] || store[clientId].resetTime < now) {
    store[clientId] = {
      count: 1,
      resetTime: now + WINDOW_MS,
    };
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', MAX_REQUESTS - 1);
    res.setHeader('X-RateLimit-Reset', store[clientId].resetTime);
    
    return next();
  }
  
  // Increment count
  store[clientId].count++;
  
  const remaining = Math.max(0, MAX_REQUESTS - store[clientId].count);
  
  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', store[clientId].resetTime);
  
  // Check if limit exceeded
  if (store[clientId].count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((store[clientId].resetTime - now) / 1000);
    res.setHeader('Retry-After', retryAfter);
    
    return res.status(429).json({
      error: 'Too many requests',
      retryAfter,
    });
  }
  
  next();
};

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const key in store) {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  }
}, 300000);
