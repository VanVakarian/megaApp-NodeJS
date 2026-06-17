import { recalculateStats } from './food-service.js';

export function setupEventHandlers(fastify) {
  fastify.addHook('onReady', () => {
    fastify.decorate('events', new Map());
  });

  fastify.decorate('scheduleStatsRecalculation', async (userId) => {
    const key = `user-id-${userId}-stats-recalculation`;
    if (!fastify.events.has(key)) {
      fastify.events.set(
        key,
        setTimeout(async () => {
          try {
            await recalculateStats(userId);
          } finally {
            fastify.events.delete(key);
          }
        }, 100)
      );
    }
  });
}
