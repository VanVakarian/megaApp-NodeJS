import * as dbFood from '../../db/db-food.js';
import * as utils from '../../utils/utils.js';
import * as foodService from './food-service.js';

export async function getFoodDiaryFullUpdateRange(request, reply) {
  const userId = request.user.id;
  // const userTZOffsetHours = 4; // TODO: implement in settings // don't need here anymore?
  // const userPreferredMidnightOffsetHours = 5; // TODO: implement in settings // don't need here anymore?
  const { date: dateIso, offset: offsetDaysStr } = request.query;
  const offsetDaysNum = parseInt(offsetDaysStr);

  const datesIsoList = foodService.getDateRange(dateIso, offsetDaysNum);
  const [startDate, endDate] = utils.getStartAndEndDates(dateIso, offsetDaysNum);

  let diaryResult = Object.fromEntries(datesIsoList.map((date) => [date, {}]));

  const foodDiaryRawData = await dbFood.getRangeOfUsersDiaryEntries(userId, startDate, endDate);
  const foodDiaryPrepped = foodService.organizeByDatesAndIds(foodDiaryRawData);
  diaryResult = foodService.extendDiary(diaryResult, 'food', foodDiaryPrepped, {});

  const bodyWeightRawData = await dbFood.getRangeOfUsersBodyWeightEntries(userId, startDate, endDate);
  const bodyWeightPrepped = foodService.organizeWeightsByDate(bodyWeightRawData);
  diaryResult = foodService.extendDiary(diaryResult, 'bodyWeight', bodyWeightPrepped, null);

  diaryResult = foodService.extendDiary(diaryResult, 'targetKcals', {}, 2500); // TODO: implement autocalc target kcals feature
  // console.log('diaryResult', JSON.stringify(diaryResult, null, 2));

  await reply.code(200).send(JSON.stringify(diaryResult));
}

/// DIARY //////////////////////////////////////////////////////////////////////

export async function createDiaryEntry(request, reply) {
  const { dateISO, foodCatalogueId, foodWeight, history } = request.body;
  const userId = request.user.id;
  const userTZOffsetHours = 4; // Это значение должно браться из настроек пользователя
  const userPreferredMidnightOffsetHours = 5; // Это значение должно браться из настроек пользователя

  try {
    const historyStr = JSON.stringify(history);
    const result = await dbFood.dbCreateDiaryEntry(dateISO, foodCatalogueId, foodWeight, historyStr, userId);

    if (result) {
      return await reply.code(201).send({ result: true, diaryId: result });
    }
    return await reply.code(400).send({ result: false });
  } catch (error) {
    console.error('Error in createDiaryEntry:', error);
    return await reply.code(500).send({ result: false, error: 'Internal server error' });
  }
}

export async function editDiaryEntry(request, reply) {
  const diaryEntry = request.body;
  const userId = request.user.id;
  const historyStr = await foodService.makeUpdatedHistoryString(diaryEntry.id, userId, diaryEntry.history[0]);
  const res = await dbFood.dbEditDiaryEntry(diaryEntry.foodWeight, historyStr, diaryEntry.id, userId);
  return await reply.code(200).send({ result: res, diaryId: diaryEntry.id });
}

export async function deleteDiaryEntry(request, reply) {
  const { diaryId } = request.params;
  const userId = request.user.id;

  try {
    const result = await dbFood.dbDeleteDiaryEntry(diaryId, userId);
    if (result) {
      return await reply.code(200).send({ result: true });
    }
    return await reply.code(404).send({ result: false, error: 'Entry not found' });
  } catch (error) {
    console.error('Error deleting diary entry:', error);
    return await reply.code(500).send({ result: false, error: 'Internal server error' });
  }
}

export async function postFood(request, reply) {
  const userId = request.user.id;
  console.log('request', request.body);
  console.log('123');
  await utils.sleep(3000);
  console.log('456');
  // const { date, id, name, calories, protein, carbs, fat, image } = request.body;

  // const foodItem = await foodService.postFoodItem(userId, date, id, name, calories, protein, carbs, fat, image);
  // console.log('foodItem', foodItem);

  await reply.code(200).send(JSON.stringify({ tempFoodId: request.body.foodId, newFoodId: 777 }));
}

/// MAIN CATALOGUE /////////////////////////////////////////////////////////////

export async function getCatalogue(request, reply) {
  const catalogue = await foodService.formFoodCatalogue();
  await reply.code(200).send(JSON.stringify(catalogue));
}

export async function createCatalogueEntry(request, reply) {
  const { foodName, foodKcals } = request.body;
  const userId = request.user.id;
  const newFoodId = await dbFood.addFoodCatalogueEntry(foodName, foodKcals);
  if (newFoodId) {
    const result = await addToUserCatalogue(userId, newFoodId);
    if (result) {
      await reply.code(200).send({ result: true, id: newFoodId });
      return;
    }
  }
  await reply.code(400).send({ result: false });
}

export async function editCatalogueEntry(request, reply) {
  const { foodId, foodName, foodKcals } = request.body;
  const result = await dbFood.updateFoodCatalogueEntry(foodId, foodName, foodKcals);
  if (result) {
    await reply.code(200).send({ result: true, id: foodId, name: foodName, kcals: foodKcals });
    return;
  }
  await reply.code(400).send({ result: false });
}

/// USER CATALOGUE /////////////////////////////////////////////////////////////

export async function getMyCatalogue(request, reply) {
  const userId = request.user.id;
  const catalogueIdsRaw = await dbFood.getUsersFoodCatalogueIds(userId);
  const catalogueIdsParsed = catalogueIdsRaw[0] ? JSON.parse(catalogueIdsRaw[0].selectedCatalogueIds) : [];
  await reply.code(200).send(JSON.stringify(catalogueIdsParsed));
}

export async function pickUserCatalogueEntry(request, reply) {
  const { foodId } = request.body;
  const userId = request.user.id;

  try {
    const result = await addToUserCatalogue(userId, parseInt(foodId));
    if (result) {
      await reply.code(200).send({ result: true });
    }
    await reply.code(400).send({ result: false });
  } catch (error) {
    console.error('Error in pickUserCatalogueEntry:', error);
  }
}

async function addToUserCatalogue(userId, foodId) {
  const catalogueIdsRaw = await dbFood.getUsersFoodCatalogueIds(userId);
  let catalogueIds = catalogueIdsRaw[0] ? JSON.parse(catalogueIdsRaw[0].selectedCatalogueIds) : [];
  if (!catalogueIds.includes(foodId)) {
    catalogueIds.push(foodId);
    catalogueIds.sort((a, b) => a - b);
    const updateResult = await dbFood.updateUsersFoodCatalogueIdsList(JSON.stringify(catalogueIds), userId);
    return updateResult;
  }
  // If the ID is already in the list, consider the operation successful
  return true;
}

export async function dismissUserCatalogueEntry(request, reply) {
  const { foodId } = request.body;
  const userId = request.user.id;
  const catalogueIdsRaw = await dbFood.getUsersFoodCatalogueIds(userId);
  if (catalogueIdsRaw && catalogueIdsRaw[0]) {
    const catalogueIds = JSON.parse(catalogueIdsRaw[0].selectedCatalogueIds);
    const index = catalogueIds.indexOf(parseInt(foodId));
    if (index > -1) {
      catalogueIds.splice(index, 1);
      const res = await dbFood.updateUsersFoodCatalogueIdsList(JSON.stringify(catalogueIds), userId);
      if (res) {
        await reply.code(200).send({ result: true });
        return;
      }
    }
  }
  await reply.code(400).send({ result: false });
}
