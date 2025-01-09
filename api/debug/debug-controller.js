import * as debugService from './debug-service.js';

export async function ping(request, reply) {
  const message = await debugService.ping();
  return reply.send({ message: message });
}

export async function transfer(request, reply) {
  const { oldUserId } = request.params;
  try {
    await debugService.pg2sqliteTransfer(oldUserId);
    return reply.code(200).send({ result: true });
  } catch (error) {
    return reply.code(500).send({ error: error.message });
  }
}

export async function transfer2(request, reply) {
  const userId = request.user.id;
  if (!userId) return reply.code(401).send({ message: 'Unauthorized' });

  try {
    await debugService.pg2sqliteTransfer(userId);
    return reply.code(200).send({ result: true });
  } catch (error) {
    return reply.code(500).send({ error: error.message });
  }
}
