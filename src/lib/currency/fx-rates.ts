/*
 * SettleMate AI — Multi-Currency FX Rates & Exact Integer Conversion
 *
 * Implements exact integer arithmetic with floor division to eliminate IEEE-754
 * floating-point drift in cross-border settlements, multi-currency conversions,
 * and tax additions.
 */

export interface FxCurrencyDef {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  minorUnitName: string;
  rateNumerator: number; // paise ratio numerator (e.g. 8325 for USD)
  rateDenominator: number; // minor unit denominator (e.g. 100 for USD cents)
  rateToINR: number; // human-readable rate (e.g. 83.25 INR per 1 USD)
  effectiveDate: string;
  source: string;
}

export const BASE_CURRENCY = "INR" as const;

/**
 * Static sovereign FX rate table with base currency INR.
 * All conversion ratios are represented as exact integer fractions (rateNumerator / rateDenominator).
 */
export const STATIC_FX_RATES: Record<string, FxCurrencyDef> = {
  INR: {
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    decimals: 2,
    minorUnitName: "paise",
    rateNumerator: 1,
    rateDenominator: 1,
    rateToINR: 1.0,
    effectiveDate: "2026-08-25",
    source: "Reserve Bank of India (RBI Reference Rate)",
  },
  USD: {
    code: "USD",
    name: "United States Dollar",
    symbol: "$",
    decimals: 2,
    minorUnitName: "cents",
    rateNumerator: 8325, // 1 USD = 8,325 paise (₹83.25) -> 100 cents = 8325 paise
    rateDenominator: 100,
    rateToINR: 83.25,
    effectiveDate: "2026-08-25",
    source: "Federal Reserve Board / RBI Reference Rate",
  },
  EUR: {
    code: "EUR",
    name: "Euro",
    symbol: "€",
    decimals: 2,
    minorUnitName: "cents",
    rateNumerator: 9010, // 1 EUR = 9,010 paise (₹90.10) -> 100 cents = 9010 paise
    rateDenominator: 100,
    rateToINR: 90.1,
    effectiveDate: "2026-08-25",
    source: "European Central Bank (ECB) / RBI Benchmark",
  },
  GBP: {
    code: "GBP",
    name: "British Pound Sterling",
    symbol: "£",
    decimals: 2,
    minorUnitName: "pence",
    rateNumerator: 10550, // 1 GBP = 10,550 paise (₹105.50) -> 100 pence = 10550 paise
    rateDenominator: 100,
    rateToINR: 105.5,
    effectiveDate: "2026-08-25",
    source: "Bank of England / RBI Reference Rate",
  },
  SGD: {
    code: "SGD",
    name: "Singapore Dollar",
    symbol: "S$",
    decimals: 2,
    minorUnitName: "cents",
    rateNumerator: 6180, // 1 SGD = 6,180 paise (₹61.80) -> 100 cents = 6180 paise
    rateDenominator: 100,
    rateToINR: 61.8,
    effectiveDate: "2026-08-25",
    source: "Monetary Authority of Singapore (MAS) / RBI",
  },
  AED: {
    code: "AED",
    name: "United Arab Emirates Dirham",
    symbol: "AED ",
    decimals: 2,
    minorUnitName: "fils",
    rateNumerator: 2265, // 1 AED = 2,265 paise (₹22.65) -> 100 fils = 2265 paise
    rateDenominator: 100,
    rateToINR: 22.65,
    effectiveDate: "2026-08-25",
    source: "Central Bank of the UAE / RBI",
  },
  JPY: {
    code: "JPY",
    name: "Japanese Yen",
    symbol: "¥",
    decimals: 0,
    minorUnitName: "yen",
    rateNumerator: 55, // 1 JPY = 55 paise (₹0.55) -> 1 yen = 55 paise
    rateDenominator: 1,
    rateToINR: 0.55,
    effectiveDate: "2026-08-25",
    source: "Bank of Japan / RBI Reference Rate",
  },
  CAD: {
    code: "CAD",
    name: "Canadian Dollar",
    symbol: "CA$",
    decimals: 2,
    minorUnitName: "cents",
    rateNumerator: 6120, // 1 CAD = 6,120 paise (₹61.20) -> 100 cents = 6120 paise
    rateDenominator: 100,
    rateToINR: 61.2,
    effectiveDate: "2026-08-25",
    source: "Bank of Canada / RBI",
  },
  AUD: {
    code: "AUD",
    name: "Australian Dollar",
    symbol: "A$",
    decimals: 2,
    minorUnitName: "cents",
    rateNumerator: 5450, // 1 AUD = 5,450 paise (₹54.50) -> 100 cents = 5450 paise
    rateDenominator: 100,
    rateToINR: 54.5,
    effectiveDate: "2026-08-25",
    source: "Reserve Bank of Australia / RBI",
  },
};

export const SUPPORTED_CURRENCIES = Object.keys(STATIC_FX_RATES);

export interface ConversionResult {
  originalAmountMinor: number;
  fromCurrency: string;
  toCurrency: string;
  convertedMinor: number; // in destination minor units (e.g. paise)
  fxRateApplied: number;
  rateNumerator: number;
  rateDenominator: number;
  roundingMethod: "INTEGER_FLOOR";
  effectiveDate: string;
}

/**
 * Converts any currency minor unit to base currency (INR paise) using exact integer arithmetic.
 * Rounding policy: FLOOR (round down) to prevent over-crediting and phantom revenue creation.
 */
export function convertToBaseMinor(
  amountMinor: number,
  fromCurrency: string,
  toCurrency: string = BASE_CURRENCY,
  customRates: Record<string, FxCurrencyDef> = STATIC_FX_RATES
): ConversionResult {
  const normFrom = fromCurrency?.toUpperCase()?.trim() || BASE_CURRENCY;
  const normTo = toCurrency?.toUpperCase()?.trim() || BASE_CURRENCY;

  if (normFrom === normTo) {
    const curDef = customRates[normFrom] || STATIC_FX_RATES.INR;
    return {
      originalAmountMinor: Math.round(amountMinor),
      fromCurrency: normFrom,
      toCurrency: normTo,
      convertedMinor: Math.round(amountMinor),
      fxRateApplied: 1.0,
      rateNumerator: 1,
      rateDenominator: 1,
      roundingMethod: "INTEGER_FLOOR",
      effectiveDate: curDef.effectiveDate,
    };
  }

  const fromDef = customRates[normFrom];
  if (!fromDef) {
    throw new Error(
      `Unsupported source currency: '${fromCurrency}'. Supported currencies: ${SUPPORTED_CURRENCIES.join(", ")}`
    );
  }

  const toDef = customRates[normTo];
  if (!toDef) {
    throw new Error(
      `Unsupported target currency: '${toCurrency}'. Supported currencies: ${SUPPORTED_CURRENCIES.join(", ")}`
    );
  }

  // Integer math using BigInt:
  // Step 1: fromCurrency -> INR Paise = floor((amountMinor * fromDef.rateNumerator) / fromDef.rateDenominator)
  const minorBig = BigInt(Math.max(0, Math.floor(amountMinor)));
  const paiseBig = (minorBig * BigInt(fromDef.rateNumerator)) / BigInt(fromDef.rateDenominator);

  let finalMinorBig = paiseBig;
  // Step 2: If target is not INR, convert INR Paise -> targetCurrency Minor = floor((paiseBig * toDef.rateDenominator) / toDef.rateNumerator)
  if (normTo !== BASE_CURRENCY) {
    finalMinorBig = (paiseBig * BigInt(toDef.rateDenominator)) / BigInt(toDef.rateNumerator);
  }

  const convertedMinor = Number(finalMinorBig);

  return {
    originalAmountMinor: Math.round(amountMinor),
    fromCurrency: normFrom,
    toCurrency: normTo,
    convertedMinor,
    fxRateApplied: fromDef.rateToINR / toDef.rateToINR,
    rateNumerator: fromDef.rateNumerator,
    rateDenominator: fromDef.rateDenominator,
    roundingMethod: "INTEGER_FLOOR",
    effectiveDate: fromDef.effectiveDate,
  };
}

/**
 * Converts a base INR paise amount into a foreign currency minor unit.
 */
export function convertFromBaseMinor(
  amountPaise: number,
  targetCurrency: string,
  customRates: Record<string, FxCurrencyDef> = STATIC_FX_RATES
): number {
  const normTarget = targetCurrency?.toUpperCase()?.trim() || BASE_CURRENCY;
  if (normTarget === BASE_CURRENCY) {
    return Math.floor(amountPaise);
  }

  const targetDef = customRates[normTarget];
  if (!targetDef) {
    throw new Error(`Unsupported currency: ${targetCurrency}`);
  }

  const paiseBig = BigInt(Math.max(0, Math.floor(amountPaise)));
  const foreignMinorBig = (paiseBig * BigInt(targetDef.rateDenominator)) / BigInt(targetDef.rateNumerator);
  return Number(foreignMinorBig);
}

/**
 * Formats any foreign or domestic currency amount given in its native minor unit.
 */
export function formatForeignCurrency(amountMinor: number, currencyCode: string): string {
  const norm = currencyCode?.toUpperCase()?.trim() || BASE_CURRENCY;
  const def = STATIC_FX_RATES[norm] || STATIC_FX_RATES.INR;

  const major = def.decimals === 0 ? amountMinor : amountMinor / Math.pow(10, def.decimals);

  try {
    return new Intl.NumberFormat(norm === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency: norm,
      minimumFractionDigits: def.decimals,
      maximumFractionDigits: def.decimals,
    }).format(major);
  } catch {
    return `${def.symbol}${major.toFixed(def.decimals)} ${norm}`;
  }
}
