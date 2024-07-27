import * as dbDebug from './db-debug.js';
import * as dbUtils from '../../db/utils.js';
import { INIT_USERS } from '../../env.js';

export async function ping() {
  return 'pong';
}

export async function pg2sqliteTransfer(oldUserId) {
  const idTranslation = Object.fromEntries(Object.entries(INIT_USERS).map(([key, value]) => [key, value.id]));

  try {
    // DIARY
    const sourceDiary = await dbDebug.readSourceDiary(oldUserId);
    // console.log('sourceDiary', sourceDiary.slice(0, 3));
    sourceDiary.forEach((row) => (row.users_id = idTranslation[oldUserId]));
    const sourceDiaryWithNewIds = await generateUniqueIdsForArrayOfObjects(5, sourceDiary, 'food_diary');
    await dbDebug.clearTargetTableOfUser('food_diary', oldUserId);
    await dbDebug.writeTargetDiary(sourceDiaryWithNewIds);

    // WEIGHTS
    const sourceWeights = await dbDebug.readSourceWeights(oldUserId);
    sourceWeights.forEach((row) => (row.users_id = idTranslation[oldUserId]));
    const sourceWeightsWithNewIds = await generateUniqueIdsForArrayOfObjects(5, sourceWeights, 'food_body_weight');
    await dbDebug.clearTargetTableOfUser('food_body_weight', oldUserId);
    await dbDebug.writeTargetWeights(sourceWeightsWithNewIds);

    // CATALOGUE
    const sourceCatalogue = await dbDebug.readSourceCatalogue();
    const sourceCatalogueWithNewIds = await generateUniqueIdsForArrayOfObjects(3, sourceCatalogue, 'food_catalogue');
    await dbDebug.clearWholeTargetTable('food_catalogue');
    await dbDebug.writeTargetCatalogue(sourceCatalogueWithNewIds);

    // FOOD SETTINGS
    const sourceSettings = await dbDebug.readSourceSettings();
    sourceSettings.forEach((row) => (row.user_id = idTranslation[row.user_id]));
    const sourceSettingsWithNewIds = await generateUniqueIdsForArrayOfObjects(2, sourceSettings, 'food_settings');
    const sourceSettingsWithUsersFoodIds = updateSettingsWithCatalogueIds(sourceCatalogueWithNewIds, sourceSettingsWithNewIds, idTranslation);

    await dbDebug.clearWholeTargetTable('food_settings');
    await dbDebug.writeTargetFoodSettings(sourceSettingsWithUsersFoodIds);
  } catch (error) {
    console.error(error);
  }
}

function updateSettingsWithCatalogueIds(listOfDictsCatalogue, listOfDictsSettings, idTranslation) {
  const newCatalogueGroupedByNewUserId = {};
  for (const value of Object.values(idTranslation)) {
    newCatalogueGroupedByNewUserId[value] = [];
  }

  listOfDictsCatalogue.forEach((item) => {
    const userKey = idTranslation[item.users_id];
    if (item.users_id === 0) {
      for (const value of Object.values(idTranslation)) {
        newCatalogueGroupedByNewUserId[value].push(item.id);
      }
    } else if (userKey) {
      newCatalogueGroupedByNewUserId[userKey].push(item.id);
    }
  });

  listOfDictsSettings.forEach((setting) => {
    const userKey = setting.user_id;
    if (newCatalogueGroupedByNewUserId[userKey]) {
      setting.selectedCatalogueIds = JSON.stringify(newCatalogueGroupedByNewUserId[userKey]);
    }
  });

  return listOfDictsSettings;
}

async function generateUniqueIdsForArrayOfObjects(idLen, listOfDicts, tableName) {
  const existingIdsSet = await dbDebug.getIdsAsSet(tableName);

  for (let item of listOfDicts) {
    let uniqueIdFound = false;
    while (!uniqueIdFound) {
      const newId = dbUtils.makeRandomId(idLen);
      if (!existingIdsSet.has(newId)) {
        item.id = newId;
        existingIdsSet.add(newId);
        uniqueIdFound = true;
      } else {
        console.log(`WTF! Duplicate ID found: ${newId}, regenerating...`);
      }
    }
  }

  return listOfDicts;
}
