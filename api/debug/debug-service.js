import { INIT_USERS } from '../../env.js';
import * as dbDebug from './db-debug.js';

export async function ping() {
  return 'pong';
}

export async function pg2sqliteTransfer(oldUserId) {
  try {
    // Getting source data
    const diary = await dbDebug.readSourceDiary(oldUserId);
    // console.log('diary', diary.slice(0, 3));
    const bodyWeights = await dbDebug.readSourceWeights(oldUserId);
    const catalogue = await dbDebug.readSourceCatalogue();
    const settings = await dbDebug.readSourceSettings();

    // Moving food ownership from 'foodCatalogue' table to 'foodSettings' table
    const catalogueIdsGroupedByUser = Object.fromEntries(Object.keys(INIT_USERS).map((userId) => [userId, []]));
    catalogue.forEach((catalogueEntry) => {
      const entryUserId = catalogueEntry.users_id.toString();
      if (entryUserId === '0') {
        Object.values(catalogueIdsGroupedByUser).forEach((arr) => arr.push(catalogueEntry.id));
      } else if (catalogueIdsGroupedByUser.hasOwnProperty(entryUserId)) {
        catalogueIdsGroupedByUser[entryUserId].push(catalogueEntry.id);
      }
    });
    settings.forEach((row) => {
      row.selectedCatalogueIds = JSON.stringify(catalogueIdsGroupedByUser[row.user_id]);
    });

    const existingIds = await dbDebug.getExistingDiaryIds(oldUserId);
    // Leaving only new entries
    const newDiaryEntries = diary.filter((entry) => !existingIds.includes(entry.id));

    await dbDebug.clearWholeTargetTable('foodCatalogue');
    await dbDebug.clearWholeTargetTable('foodSettings');

    // Writing only new entries
    if (newDiaryEntries.length > 0) await dbDebug.writeTargetDiary(newDiaryEntries);

    // Dumping other data into db
    await dbDebug.writeTargetWeights(bodyWeights);
    await dbDebug.writeTargetCatalogue(catalogue);
    await dbDebug.writeTargetFoodSettings(settings);
  } catch (error) {
    console.error(error);
  }
}
