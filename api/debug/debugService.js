import { PGService, sqliteService } from './pg2sqliteDbFns.js';

const debugService = {
  async ping() {
    return 'pong';
  },

  async transfer() {
    const sourceDiary = await PGService.readSourceDiary();
    const sourceCatalogue = await PGService.readSourceCatalogue();
    const sourceWeights = await PGService.readSourceWeights();

    await sqliteService.clearTargetTables();

    await sqliteService.writeTargetDiary(sourceDiary);
    await sqliteService.writeTargetCatalogue(sourceCatalogue);
    await sqliteService.writeTargetWeights(sourceWeights);
  },
};

export default debugService;
