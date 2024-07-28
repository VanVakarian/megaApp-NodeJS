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
    const sourceBodyWeights = await dbDebug.readSourceWeights(oldUserId);
    const sourceCatalogue = await dbDebug.readSourceCatalogue();
    const sourceSettings = await dbDebug.readSourceSettings();

    // Generating new ids
    const userIdMap = Object.fromEntries(Object.entries(INIT_USERS).map(([key, value]) => [key, value.id]));
    const [newDiary] = await generateUniqueIdsForArrayOfObjects(5, sourceDiary, 'food_diary');
    const [newBodyWeights] = await generateUniqueIdsForArrayOfObjects(5, sourceBodyWeights, 'food_body_weight');
    const [newCatalogue, catalogueIdMap] = await generateUniqueIdsForArrayOfObjects(3, sourceCatalogue, 'food_catalogue'); // prettier-ignore
    const [newSettings] = await generateUniqueIdsForArrayOfObjects(2, sourceSettings, 'food_settings');

    // a little bit of data transformation
    newDiary.forEach((row) => {
      row.users_id = userIdMap[row.users_id];
      row.catalogue_id = catalogueIdMap[row.catalogue_id];
    });
    newBodyWeights.forEach((row) => (row.users_id = userIdMap[row.users_id]));
    newCatalogue.forEach((row) => (row.users_id = userIdMap[row.users_id] ?? 0));
    const catalogueIdsGroupedByUser = {};
    Object.values(userIdMap).forEach((newUserId) => {
      catalogueIdsGroupedByUser[newUserId] = [];
      newCatalogue.forEach((row) => {
        if (row.users_id === newUserId || row.users_id === 0) {
          catalogueIdsGroupedByUser[newUserId].push(row.id);
        }
      });
    });
    newSettings.forEach((row) => {
      row.user_id = userIdMap[row.user_id];
      row.selectedCatalogueIds = JSON.stringify(catalogueIdsGroupedByUser[row.user_id]);
    });

    // clearing tables
    await dbDebug.clearTargetTableOfUser('food_diary', userIdMap[oldUserId]);
    await dbDebug.clearTargetTableOfUser('food_body_weight', userIdMap[oldUserId]);
    await dbDebug.clearWholeTargetTable('food_catalogue');
    await dbDebug.clearWholeTargetTable('food_settings');

    // dumping data into db
    await dbDebug.writeTargetDiary(newDiary);
    await dbDebug.writeTargetWeights(newBodyWeights);
    await dbDebug.writeTargetCatalogue(newCatalogue);
    await dbDebug.writeTargetFoodSettings(newSettings);
  } catch (error) {
    console.error(error);
  }
}

async function generateUniqueIdsForArrayOfObjects(idLen, listOfDicts, tableName) {
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
