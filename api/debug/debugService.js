import { PGService, sqliteService } from './pg2sqliteDbFns.js';

const debugService = {
  async ping() {
    return 'pong';
  },

  async transfer() {
    const sourceCatalogue = await PGService.readSourceCatalogue();
    const sourceDiary = await PGService.readSourceDiary();
    const sourceWeights = await PGService.readSourceWeights();

    await sqliteService.clearTargetTables();

    await sqliteService.writeTargetCatalogue(sourceCatalogue);
    await sqliteService.writeTargetDiary(sourceDiary);
    await sqliteService.writeTargetWeights(sourceWeights);
  },
};

export default debugService;
