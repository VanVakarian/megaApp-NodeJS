export function invertRate(value) {
  if (!value || value === 0) return null;
  return 1 / value;
}

export function rubToUsd(rubPrice, rubUsdRate) {
  if (!rubPrice || !rubUsdRate || rubUsdRate === 0) return null;
  return rubPrice * rubUsdRate;
}

export function bondRubToUsd(moexBondPrice, rubUsdRate) {
  if (!moexBondPrice || !rubUsdRate || rubUsdRate === 0) return null;
  return moexBondPrice * 10 * rubUsdRate;
}

export function getRubUsdRate(ratesForDate) {
  if (!ratesForDate || !ratesForDate['RUB'] || ratesForDate['RUB'] === 0) return null;
  return ratesForDate['RUB'];
}
