import * as dbFood from '../../db/db-food.js';

// import { FOOD_FETCH_DAYS_RANGE_OFFSET } from '../../env.js';

export function getDateRange(dateIso, fetchDaysRangeOffset, userTZOffsetHours, userPreferredMidnightOffsetHours) {
  const date = new Date(dateIso);
  date.setUTCHours(userPreferredMidnightOffsetHours - userTZOffsetHours, 0, 0, 0);
  const result = [];
  for (let i = -fetchDaysRangeOffset; i <= fetchDaysRangeOffset; i++) {
    const d = new Date(date);
    d.setDate(date.getDate() + i);
    result.push(d.toISOString().split('T')[0]);
  }
  return result;
}

// export function dictifyDatesList(datesList) {
//   return Object.fromEntries(datesList.map((date) => [date, {}]));
// }

export function organizeByDatesAndIds(inboundList) {
  const resultDict = {};
  inboundList.forEach((food) => {
    const date = food.dateISO;
    const id = food.id;
    if (!resultDict[date]) {
      resultDict[date] = {};
    }
    resultDict[date][id] = {
      id: food.id,
      foodCatalogueId: food.foodCatalogueId,
      foodWeight: food.foodWeight,
      dateIso: date,
      history: [],
    };

    try {
      resultDict[date][id].history = JSON.parse(food.history);
    } catch (error) {
      // история уже инициализирована пустым массивом выше
    }
  });
  return resultDict;
}

export function extendDiary(targetDict, propertyName, value, valueIfNone) {
  for (const date in targetDict) {
    targetDict[date][propertyName] = value[date] || valueIfNone;
  }
  return targetDict;
}

export function organizeWeightsByDate(arrayOfWeights) {
  const resultDict = {};
  arrayOfWeights.forEach((weightObj) => {
    resultDict[weightObj.dateISO] = weightObj.weight;
  });
  return resultDict;
}

export async function formFoodCatalogue() {
  const foodCatalogueRaw = await dbFood.getAllFoodCatalogueEntries();
  const foodCataloguePrepped = prepFoodCatalogue(foodCatalogueRaw);
  return foodCataloguePrepped;
}

export function prepFoodCatalogue(catalogueArray) {
  const catalogueObj = {};
  for (const entry of catalogueArray) {
    catalogueObj[entry.id] = entry;
  }
  return catalogueObj;
}

export async function makeUpdatedHistoryString(diaryId, userId, newHistoryEntry) {
  const resHistory = await dbFood.dbGetDiaryEntriesHistory(diaryId, userId);
  const updatedHistory = resHistory.length ? JSON.parse(resHistory[0].history) : [];
  updatedHistory.push(newHistoryEntry);
  const historyString = JSON.stringify(updatedHistory);
  return historyString;
}

export async function updateDiaryEntryInDB(foodWeight, updatedHistory, diaryId, userId) {
  const historyString = JSON.stringify(updatedHistory);
  return await dbFood.dbEditDiaryEntry(foodWeight, historyString, diaryId, userId);
}
