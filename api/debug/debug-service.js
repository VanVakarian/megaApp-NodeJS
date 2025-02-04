import { INIT_USERS } from '../../env.js';
import * as dbDebug from './db-debug.js';

export async function ping() {
  return 'pong';
}

export async function pg2sqliteTransferLite() {
  try {
    const catalogue = await dbDebug.readSourceCatalogue();
    const settings = await dbDebug.readSourceSettings();

    // Moving food ownership from 'foodCatalogue' table to 'foodSettings' table
    const catalogueIdsGroupedByUser = Object.fromEntries(INIT_USERS.map((user) => [user.id, []]));
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

    await dbDebug.clearWholeTargetTable('foodCatalogue');
    await dbDebug.writeTargetCatalogue(catalogue);

    await dbDebug.clearWholeTargetTable('foodSettings');
    await dbDebug.writeTargetFoodSettings(settings);

    console.log('pg2sqliteTransferLite ran successfully');
  } catch (error) {
    console.error(error);
  }
}

export async function pg2sqliteTransfer(oldUserId) {
  try {
    // Getting source data
    const diary = await dbDebug.readSourceDiary(oldUserId);
    const bodyWeights = await dbDebug.readSourceWeights(oldUserId);
    const catalogue = await dbDebug.readSourceCatalogue();
    const settings = await dbDebug.readSourceSettings();

    // Moving food ownership from 'foodCatalogue' table to 'foodSettings' table
    const catalogueIdsGroupedByUser = Object.fromEntries(INIT_USERS.map((user) => [user.id, []]));
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
