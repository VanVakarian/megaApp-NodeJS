export const SYMBOL_POSITION = {
  BEFORE: 'before',
  AFTER: 'after',
};

export function isSymbolPositionValid(symbolPosEnum) {
  return Object.values(SYMBOL_POSITION).includes(symbolPosEnum);
}

export const ENTITY_SCOPE = {
  TRANSACTION: 'moneyTransaction',
  ACCOUNT: 'moneyAccount',
  ASSET: 'moneyAsset',
};

export function isEntityScopeValid(entityScope) {
  return Object.values(ENTITY_SCOPE).includes(entityScope);
}
