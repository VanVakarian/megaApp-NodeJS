import * as utils from '../../utils/utils.js';
import * as dbFood from '../../db/db-food.js';

// import { FOOD_FETCH_DAYS_RANGE_OFFSET } from '../../env.js';

export function getDateRange(dateIso, fetchDaysRangeOffset) {
  const date = new Date(dateIso);
  const result = [];
  for (let i = -fetchDaysRangeOffset; i <= fetchDaysRangeOffset; i++) {
    const d = new Date(date);
    d.setDate(date.getDate() + i);
    result.push(d.toISOString().split('T')[0]);
  }
  return result;
}

export function dictifyDatesList(datesList) {
  return Object.fromEntries(datesList.map((date) => [date, {}]));
}

export function organizeByDatesAndIds(inboundList) {
  const resultDict = {};
  inboundList.forEach((food) => {
    const date = new Date(food.date * 1000).toISOString().split('T')[0];
    const id = food.id;
    if (!resultDict[date]) {
      resultDict[date] = {};
    }
    resultDict[date][id] = food;
    try {
      resultDict[date][id].history = JSON.parse(food.history);
    } catch (error) {
      resultDict[date][id].history = [];
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

export function organizeWeightsByDate(inboundList) {
  const resultDict = {};
  inboundList.forEach((item) => {
    const date = new Date(item.date * 1000).toISOString().split('T')[0];
    resultDict[date] = item.weight;
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
  const resHistory = await dbFood.dbGetDiaryEntrysHistory(diaryId, userId);
  const updatedHistory = resHistory.length ? JSON.parse(resHistory[0].history) : [];
  updatedHistory.push(newHistoryEntry);
  const historyString = JSON.stringify(updatedHistory);
  return historyString;
}

export async function updateDiaryEntryInDB(foodWeight, updatedHistory, diaryId, userId) {
  const historyString = JSON.stringify(updatedHistory);
  return await dbFood.db_edit_diary_entry(foodWeight, historyString, diaryId, userId);
}
