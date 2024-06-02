import debugService from './debugService.js';

const debugController = {
  async ping(request, reply) {
    const message = await debugService.ping();
    reply.send({ message: message });
  },
};

export default debugController;
