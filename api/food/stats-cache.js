import * as dbUsers from '../../db/db-users.js';
import { recalculateStats } from './food-service.js';

const statsCache = new Map();

export async function initCache() {
  statsCache.clear();
  const users = await dbUsers.getAllUserIds();

  for (const user of users) {
    await recalculateStats(user.id);
  }
}
export function getCachedStats(userId) {
  return statsCache.get(userId);
}

export function saveCachedStats(userId, stats) {
  statsCache.set(userId, { stats: JSON.stringify(stats) });
}

export function clearCachedStats(userId) {
  statsCache.delete(userId);
}
