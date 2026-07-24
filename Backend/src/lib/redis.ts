import Redis from 'ioredis';

// Fail-safe initialization
let redis: Redis | null = null;
let isRedisConnected = false;

try {
  // If no REDIS_URL is provided, we default to localhost.
  // We use maxRetriesPerRequest = 1 and a custom retryStrategy so it gives up quickly if Redis isn't installed.
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => {
      // Don't retry if we can't connect, so the app doesn't crash or hang
      return null;
    },
    // Add connection timeout
    connectTimeout: 2000,
  });

  redis.on('error', (err) => {
    isRedisConnected = false;
    // We only log a subtle warning in development if it's a connection refused, to avoid spamming the console
    if (err.message.includes('ECONNREFUSED')) {
      // Only log once
    } else {
      console.warn('[Redis] Cache warning:', err.message);
    }
  });

  redis.on('ready', () => {
    isRedisConnected = true;
    console.log('[Redis] Cache connected successfully.');
  });
} catch (e) {
  console.warn('[Redis] Failed to initialize Redis client.');
}

/**
 * A fail-safe wrapper that attempts to get data from Redis cache.
 * If Redis is offline or missing, it safely falls back to calling the fetcher function.
 * 
 * @param key Unique string key for this cache entry
 * @param ttlSeconds Time-to-live in seconds before the cache expires
 * @param fetcher Async function that fetches the data from DB if cache misses
 * @returns The cached or freshly fetched data
 */
export async function getCached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  // If Redis is not connected, skip cache and go straight to DB
  if (!redis || !isRedisConnected) {
    return fetcher();
  }

  try {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
  } catch (err) {
    // Ignore read errors
  }

  // Cache miss - fetch fresh data
  const data = await fetcher();

  try {
    if (data !== undefined && data !== null) {
      // Store in cache for next time
      await redis.setex(key, ttlSeconds, JSON.stringify(data));
    }
  } catch (err) {
    // Ignore write errors
  }

  return data;
}

/** Drop a cache key after mutations so the next read is fresh */
export async function invalidateCached(key: string): Promise<void> {
  if (!redis || !isRedisConnected) return;
  try {
    await redis.del(key);
  } catch {
    // ignore
  }
}

export function studentDashboardCacheKey(userId: string): string {
  return `student_dashboard_stats_${userId}`;
}

export function contentMasterCourseCacheKey(courseId: string): string {
  return `content_master:course:${courseId}`;
}

export function contentMasterBatchCacheKey(batchId: string): string {
  return `content_master:batch:${batchId}`;
}
