export const SYMBOL_POSITION = {
  BEFORE: 'before',
  AFTER: 'after',
};

export function isSymbolPositionValid(symbolPosEnum) {
  return Object.values(SYMBOL_POSITION).includes(symbolPosEnum);
}

export const USED_FOR = {
  TRANSACTION: 'transaction',
  ACCOUNT: 'account',
  ASSET: 'asset',
};

export function isUsedForValid(usedFor) {
  return Object.values(USED_FOR).includes(usedFor);
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
