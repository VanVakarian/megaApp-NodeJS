export const migration002to001 = [
  `DROP TABLE IF EXISTS moneyTransaction;`,
  `DROP TABLE IF EXISTS moneyAsset;`,
  `DROP TABLE IF EXISTS moneyAccount;`,
  `DROP TABLE IF EXISTS moneyCurrency;`,
  `DROP TABLE IF EXISTS moneyCategories;`,
];
