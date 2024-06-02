import debugService from './debugService.js';
import { PGService, sqliteService } from './pg2sqliteDbFns.js';

const debugController = {
  async ping(request, reply) {
    const message = await debugService.ping();
    reply.send({ message: message });
  },

  async transfer(request, reply) {
    try {
      const sourceCatalogue = await PGService.readSourceCatalogue();
      const sourceDiary = await PGService.readSourceDiary();
      const sourceWeights = await PGService.readSourceWeights();

      await sqliteService.clearTargetTables();

      await sqliteService.writeTargetCatalogue(sourceCatalogue);
      await sqliteService.writeTargetDiary(sourceDiary);
      await sqliteService.writeTargetWeights(sourceWeights);

      reply.send({ job: 'done' });
    } catch (error) {
      reply.status(500).send({ error: error.message });
    }
  },
};

export default debugController;
