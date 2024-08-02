import * as dbDebug from './db-debug.js';
import * as dbUtils from '../../db/utils.js';
import { INIT_USERS } from '../../env.js';

export async function ping() {
  return 'pong';
}

export async function pg2sqliteTransfer(oldUserId) {
  try {
    // Getting source data
    const sourceDiary = await dbDebug.readSourceDiary(oldUserId);
    console.log('sourceDiary', sourceDiary.slice(0, 3));
    const sourceBodyWeights = await dbDebug.readSourceWeights(oldUserId);
    const sourceCatalogue = await dbDebug.readSourceCatalogue();
    const sourceSettings = await dbDebug.readSourceSettings();

    // Generating new ids
    const userIdMap = Object.fromEntries(Object.entries(INIT_USERS).map(([key, value]) => [key, value.id]));
    const [newDiary, _] = await generateUniqueIds(5, sourceDiary, 'foodDiary');
    const [newBodyWeights, __] = await generateUniqueIds(5, sourceBodyWeights, 'food_body_weight');
    const [newCatalogue, catalogueIdMap] = await generateUniqueIds(3, sourceCatalogue, 'food_catalogue'); // prettier-ignore
    const [newSettings, ___] = await generateUniqueIds(2, sourceSettings, 'food_settings');

    // Applying new ids
    newDiary.forEach((row) => {
      row.users_id = userIdMap[row.users_id];
      row.catalogue_id = catalogueIdMap[row.catalogue_id];
    });
    newBodyWeights.forEach((row) => (row.users_id = userIdMap[row.users_id]));
    newCatalogue.forEach((row) => (row.users_id = userIdMap[row.users_id] ?? 0));

    // Converting ISO dates to UNIX time.
    // Using a counter to get unique dates within a day to preserve original order.
    let counter = 36000; // plus 10 hours, so it's not like this item was added at midnight.
    newDiary.forEach((entry) => (entry.date = new Date(entry.date).getTime() / 1000 + counter++));
    counter = 36000;
    newBodyWeights.forEach((entry) => (entry.date = new Date(entry.date).getTime() / 1000 + counter++));
    console.log('newBodyWeights', newBodyWeights.slice(0, 3));

    // Moving food ownership from 'food_catalogue' table to 'food_settings' table
    const catalogueIdsGroupedByUser = {};
    Object.values(userIdMap).forEach((newUserId) => {
      catalogueIdsGroupedByUser[newUserId] = [];
      newCatalogue.forEach((catalogueEntry) => {
        if (catalogueEntry.users_id === newUserId || catalogueEntry.users_id === 0) {
          catalogueIdsGroupedByUser[newUserId].push(catalogueEntry.id);
        }
      });
    });
    newSettings.forEach((row) => {
      row.user_id = userIdMap[row.user_id];
      row.selectedCatalogueIds = JSON.stringify(catalogueIdsGroupedByUser[row.user_id]);
    });

    // Clearing tables
    await dbDebug.clearTargetTableOfUser('foodDiary', userIdMap[oldUserId]);
    await dbDebug.clearTargetTableOfUser('food_body_weight', userIdMap[oldUserId]);
    await dbDebug.clearWholeTargetTable('food_catalogue');
    await dbDebug.clearWholeTargetTable('food_settings');

    // Dumping data into db
    await dbDebug.writeTargetDiary(newDiary);
    await dbDebug.writeTargetWeights(newBodyWeights);
    await dbDebug.writeTargetCatalogue(newCatalogue);
    await dbDebug.writeTargetFoodSettings(newSettings);
  } catch (error) {
    console.error(error);
  }
}

async function generateUniqueIds(idLen, listOfDicts, tableName) {
  const existingIdsSet = await dbDebug.getIdsFromATableAsSet(tableName);
  const idMap = {};

  for (let item of listOfDicts) {
    let uniqueIdFound = false;
    const oldId = item.id;

    while (!uniqueIdFound) {
      const newId = dbUtils.makeRandomId(idLen);
      if (!existingIdsSet.has(newId)) {
        item.id = newId;
        existingIdsSet.add(newId);
        uniqueIdFound = true;

        if (oldId) {
          idMap[oldId] = newId;
        }
      } else {
        console.log(`WTF! Duplicate ID found: ${newId}, regenerating...`);
      }
    }
  }

  return [listOfDicts, idMap];
}
