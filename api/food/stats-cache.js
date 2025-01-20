import * as dbUsers from '../../db/db-users.js';
import { getStats } from './food-service.js';

const statsCache = new Map();

export function getCachedStats(userId) {
  const cachedStatsString = statsCache.get(userId);
  return cachedStatsString;
}

export function saveStats(userId, upToDate, stats) {
  statsCache.set(userId, { upToDate, stats: JSON.stringify(stats) });
}

export async function initCache() {
  statsCache.clear();
  const users = await dbUsers.getAllUserIds();
  const dateIso = new Date().toISOString().split('T')[0];

  for (const user of users) {
    await getStats(user.id, dateIso);
  }
}
