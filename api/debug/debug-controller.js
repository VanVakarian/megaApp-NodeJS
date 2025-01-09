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

// export async function chrextest(request, reply) {
//   try {
//     console.log('request', request.body);
//     reply.send({ response: 'received' });
//   } catch (error) {
//     reply.status(500).send({ error: error.message });
//   }
// }
