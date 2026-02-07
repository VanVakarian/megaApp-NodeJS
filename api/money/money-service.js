export const SYMBOL_POSITION = {
  BEFORE: 'before',
  AFTER: 'after',
};

export function isSymbolPositionValid(symbolPosEnum) {
  return Object.values(SYMBOL_POSITION).includes(symbolPosEnum);
}

export const CATEGORY_TYPE = {
  INCOME: 'income',
  EXPENSE: 'expense',
};

export function isCategoryTypeValid(categoryType) {
  return Object.values(CATEGORY_TYPE).includes(categoryType);
}

export const ACCOUNT_KIND = {
  CASH: 'cash',
  CARD: 'card',
  CHECKING: 'checking',
  DEPOSIT: 'deposit',
  BROKERAGE: 'brokerage',
  CRYPTO: 'crypto',
  // LOAN: 'loan',
};

export function isAccountKindValid(kind) {
  return Object.values(ACCOUNT_KIND).includes(kind);
}

export const TRANSACTION_KIND = {
  INCOME: 'income',
  EXPENSE: 'expense',
  TRANSFER: 'transfer',
};

export function isTransactionKindValid(kind) {
  return Object.values(TRANSACTION_KIND).includes(kind);
}
