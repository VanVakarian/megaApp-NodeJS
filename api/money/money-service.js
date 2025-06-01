export const SYMBOL_POSITION = {
  BEFORE: 'before',
  AFTER: 'after',
};

export function isSymbolPositionValid(symbolPosEnum) {
  return Object.values(SYMBOL_POSITION).includes(symbolPosEnum);
}
