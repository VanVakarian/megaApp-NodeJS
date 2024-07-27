import { transformIsoDateAddDays, isValidISODate } from '../../utils/utils.js';
import * as dbFood from '../../db/db-food.js';

// import { FOOD_FETCH_DAYS_RANGE_OFFSET } from '../../env.js';

export async function getFoodDiaryRange(userId, dateIso, rangeDays) {
  const date = isValidISODate(dateIso) ? dateIso : new Date().toISOString().split('T')[0];
  // console.log('date', date);
  // const rangeDays = rangeDays ?? FOOD_FETCH_DAYS_RANGE_OFFSET;
  // console.log('rangeDays', rangeDays);
  const startDate = transformIsoDateAddDays(date, rangeDays * -1);
  // console.log('startDate', startDate);
  const endDate = transformIsoDateAddDays(date, rangeDays);
  // console.log('endDate', endDate);
  const foodDiary = await dbFood.getRangeOfUsersDiaryEntries(startDate, endDate, userId);
  return foodDiary;
}

export function dictifyDatesList(datesList) {
  return Object.fromEntries(datesList.map((date) => [date, {}]));
}

export function getDateRange(isoDate, fetchDaysRangeOffset) {
  const date = new Date(isoDate);
  const now = new Date();

  const datesBefore = Array.from({ length: fetchDaysRangeOffset }, (_, i) => {
    const d = new Date(date);
    d.setDate(date.getDate() - (fetchDaysRangeOffset - i));
    return d.toISOString().split('T')[0];
  });

  const datesAfter = Array.from({ length: fetchDaysRangeOffset }, (_, i) => {
    const d = new Date(date);
    d.setDate(date.getDate() + i + 1);
    return d <= now ? d.toISOString().split('T')[0] : null;
  }).filter(Boolean);

  return [...datesBefore, isoDate, ...datesAfter];
}

export function organizeByDatesAndIds(inboundList) {
  const resultDict = {};
  inboundList.forEach((food) => {
    const date = new Date(food.date).toISOString().split('T')[0];
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

export async function formFoodCatalogue() {
  const foodCatalogueRaw = await dbFood.getAllFoodCatalogueEntries();
  const foodCataloguePrepped = this.prepFoodCatalogue(foodCatalogueRaw);
  return foodCataloguePrepped;
}

export function prepFoodCatalogue(catalogueArray) {
  const catalogueObj = {};
  for (const entry of catalogueArray) {
    catalogueObj[entry.id] = entry;
  }
  return catalogueObj;
}
