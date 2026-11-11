// src/lib/server/intelligence/commercial-validator.ts
/**
 * Deterministic Financial & Commercial Arithmetic Validator.
 *
 * Requirements:
 * - No binary floating-point arithmetic for money.
 * - Exact decimal string parsing with currency minor-unit precision.
 * - Rejection of invalid monetary strings.
 * - Independent validation of line totals (quantity * unit price).
 * - Exact half-up decimal rounding (e.g. "1.005" -> 101 cents, avoiding IEEE-754 float error where 1.005 * 100 = 100.49999999999999).
 * - Currency minor unit mapping (USD/EUR/GBP = 2, JPY/KRW = 0, KWD/BHD = 3).
 * - Currency mismatch detection.
 */

export interface CurrencyConfig {
  minorUnits: number;
  symbol: string;
}

export const CURRENCY_CONFIGS: Record<string, CurrencyConfig> = {
  USD: { minorUnits: 2, symbol: "$" },
  EUR: { minorUnits: 2, symbol: "€" },
  GBP: { minorUnits: 2, symbol: "£" },
  CAD: { minorUnits: 2, symbol: "$" },
  AUD: { minorUnits: 2, symbol: "$" },
  JPY: { minorUnits: 0, symbol: "¥" },
  KRW: { minorUnits: 0, symbol: "₩" },
  KWD: { minorUnits: 3, symbol: "KD" },
  BHD: { minorUnits: 3, symbol: "BD" },
};

/**
 * Returns minor unit exponent for a given ISO currency code.
 */
export function getCurrencyMinorUnits(currencyCode = "USD"): number {
  const norm = currencyCode.toUpperCase().trim();
  return CURRENCY_CONFIGS[norm]?.minorUnits ?? 2;
}

/**
 * Parses a decimal string directly into integer minor units (e.g. cents) without binary float multiplication.
 *
 * Handles:
 * - "1.005" -> 101 cents (half-up at minor-unit boundary, avoiding float 100.49999999999999)
 * - "0.10" -> 10 cents
 * - "999999.99" -> 99999999 cents
 * - "-50.25" -> -5025 cents
 * - "$1,234.56" -> 123456 cents
 *
 * Throws an Error or returns null if the string is not a syntactically valid monetary value.
 */
export function parseDecimalToMinorUnits(
  amount: string | number | null | undefined,
  minorUnits = 2
): number {
  if (amount === null || amount === undefined) {
    return 0;
  }

  let str = String(amount).trim();
  if (str === "") return 0;

  // Detect negative sign
  let isNegative = false;
  if (str.startsWith("-") || str.startsWith("(") && str.endsWith(")")) {
    isNegative = true;
    str = str.replace(/[()]/g, "").replace(/^-/, "").trim();
  }

  // Strip known currency symbols and thousand commas
  str = str.replace(/[$€£¥₩,]/g, "").trim();

  // Strict syntax validation: must be digits optionally followed by single dot and digits
  const validDecimalRegex = /^[0-9]+(\.[0-9]+)?$/;
  if (!validDecimalRegex.test(str)) {
    throw new Error(`Invalid monetary format: "${amount}". Must be a valid decimal number.`);
  }

  const [intPart, fracPart = ""] = str.split(".");

  if (minorUnits === 0) {
    // 0 minor units (e.g. JPY): round at first decimal place if present
    let units = BigInt(intPart);
    if (fracPart.length > 0 && parseInt(fracPart[0], 10) >= 5) {
      units += BigInt(1);
    }
    const val = Number(units);
    return isNegative ? -val : val;
  }

  // Decimal half-up rounding at the minorUnits digit
  const paddedFrac = fracPart.padEnd(minorUnits + 1, "0");
  const baseFraction = paddedFrac.slice(0, minorUnits);
  const nextDigit = parseInt(paddedFrac[minorUnits] || "0", 10);

  let totalUnits = BigInt(intPart) * BigInt(10 ** minorUnits) + BigInt(baseFraction);
  if (nextDigit >= 5) {
    totalUnits += BigInt(1);
  }

  const result = Number(totalUnits);
  return isNegative ? -result : result;
}

/**
 * Legacy wrapper for backward compatibility with existing services.
 * Uses exact decimal parsing rather than Math.round(amount * 100).
 */
export function parseToCents(amountStr: string | number | null | undefined): number {
  try {
    return parseDecimalToMinorUnits(amountStr, 2);
  } catch {
    return 0;
  }
}

/**
 * Formats integer minor units back to exact decimal string (e.g. 10050, 2 -> "100.50").
 */
export function minorUnitsToDecimalString(units: number, minorUnits = 2): string {
  const isNegative = units < 0;
  const abs = BigInt(Math.abs(units));

  if (minorUnits === 0) {
    return isNegative ? `-${abs.toString()}` : abs.toString();
  }

  const factor = BigInt(10 ** minorUnits);
  const whole = abs / factor;
  const remainder = abs % factor;
  const fracStr = remainder.toString().padStart(minorUnits, "0");
  const str = `${whole.toString()}.${fracStr}`;
  return isNegative ? `-${str}` : str;
}

export function centsToDecimalString(cents: number): string {
  return minorUnitsToDecimalString(cents, 2);
}

/**
 * Multiplies quantity by unit price in exact integer minor units.
 * Supports decimal quantities (e.g. 2.5 units @ $10.00 = $25.00).
 */
export function multiplyQuantityByUnitPrice(
  quantityStr: string | number,
  unitPriceStr: string | number,
  minorUnits = 2
): number {
  const unitMinorUnits = parseDecimalToMinorUnits(unitPriceStr, minorUnits);
  const qStr = String(quantityStr).replace(/,/g, "").trim();

  if (!/^[0-9]+(\.[0-9]+)?$/.test(qStr)) {
    throw new Error(`Invalid quantity: "${quantityStr}"`);
  }

  const [qInt, qFrac = ""] = qStr.split(".");
  const qDecimals = qFrac.length;

  if (qDecimals === 0) {
    return unitMinorUnits * parseInt(qInt, 10);
  }

  const qFactor = 10 ** qDecimals;
  const qWhole = parseInt(qInt + qFrac, 10);
  // Integer arithmetic: (unitMinorUnits * qWhole + qFactor/2) / qFactor
  const product = BigInt(unitMinorUnits) * BigInt(qWhole);
  const half = BigInt(qFactor / 2);
  const rounded = (product + half) / BigInt(qFactor);
  return Number(rounded);
}

export interface LineItemValidation {
  product_name: string;
  quantity: number | string;
  unit_price: string;
  expected_line_total: string;
  stated_line_total: string;
  is_valid: boolean;
  discrepancy_minor_units: number;
  discrepancy_cents: number;
}

export interface CommercialArithmeticResult {
  is_valid: boolean;
  currency: string;
  subtotal: string;
  calculated_subtotal: string;
  total_amount: string;
  calculated_total: string;
  line_item_validations: LineItemValidation[];
  warnings: string[];
  currency_mismatch?: boolean;
}

/**
 * Verifies mathematical integrity of PO line items and totals using exact decimal arithmetic.
 */
export function validatePurchaseOrderArithmetic(po: {
  currency?: string;
  expected_currency?: string;
  subtotal?: string | number;
  total_amount?: string | number;
  tax?: string | number;
  shipping?: string | number;
  line_items?: Array<{
    product_name?: string;
    quantity?: string | number;
    unit_price?: string | number;
    line_total?: string | number;
    currency?: string;
  }>;
}): CommercialArithmeticResult {
  const currency = (po.currency || "USD").toUpperCase();
  const minorUnits = getCurrencyMinorUnits(currency);
  const lineValidations: LineItemValidation[] = [];
  const warnings: string[] = [];

  let currencyMismatch = false;
  if (po.expected_currency && po.expected_currency.toUpperCase() !== currency) {
    currencyMismatch = true;
    warnings.push(
      `Currency mismatch: Purchase Order specifies ${currency}, but agreement requires ${po.expected_currency.toUpperCase()}.`
    );
  }

  let calculatedSubtotalUnits = 0;

  if (po.line_items && po.line_items.length > 0) {
    for (const item of po.line_items) {
      if (item.currency && item.currency.toUpperCase() !== currency) {
        currencyMismatch = true;
        warnings.push(
          `Line item currency mismatch: Item '${item.product_name}' currency ${item.currency} differs from PO currency ${currency}.`
        );
      }

      let unitPriceUnits = 0;
      let statedTotalUnits = 0;
      let expectedTotalUnits = 0;
      let parseFailed = false;

      try {
        unitPriceUnits = parseDecimalToMinorUnits(item.unit_price, minorUnits);
      } catch {
        warnings.push(`Line item '${item.product_name}': invalid unit price "${item.unit_price}"`);
        parseFailed = true;
      }

      try {
        statedTotalUnits = parseDecimalToMinorUnits(item.line_total, minorUnits);
      } catch {
        warnings.push(`Line item '${item.product_name}': invalid line total "${item.line_total}"`);
        parseFailed = true;
      }

      const qRaw = item.quantity ?? 0;
      try {
        expectedTotalUnits = multiplyQuantityByUnitPrice(qRaw, item.unit_price ?? 0, minorUnits);
      } catch {
        warnings.push(`Line item '${item.product_name}': invalid quantity "${qRaw}"`);
        parseFailed = true;
      }

      calculatedSubtotalUnits += expectedTotalUnits;

      const isValid = !parseFailed && Math.abs(expectedTotalUnits - statedTotalUnits) === 0;
      if (!isValid && !parseFailed) {
        warnings.push(
          `Line item '${item.product_name || "Unknown"}': ${qRaw} @ ${minorUnitsToDecimalString(unitPriceUnits, minorUnits)} expected ${minorUnitsToDecimalString(expectedTotalUnits, minorUnits)}, stated ${minorUnitsToDecimalString(statedTotalUnits, minorUnits)}`
        );
      }

      lineValidations.push({
        product_name: item.product_name || "Item",
        quantity: qRaw,
        unit_price: minorUnitsToDecimalString(unitPriceUnits, minorUnits),
        expected_line_total: minorUnitsToDecimalString(expectedTotalUnits, minorUnits),
        stated_line_total: minorUnitsToDecimalString(statedTotalUnits, minorUnits),
        is_valid: isValid,
        discrepancy_minor_units: statedTotalUnits - expectedTotalUnits,
        discrepancy_cents: statedTotalUnits - expectedTotalUnits,
      });
    }
  }

  let taxUnits = 0;
  let shippingUnits = 0;
  try {
    taxUnits = parseDecimalToMinorUnits(po.tax, minorUnits);
  } catch {
    warnings.push(`Invalid tax value: "${po.tax}"`);
  }
  try {
    shippingUnits = parseDecimalToMinorUnits(po.shipping, minorUnits);
  } catch {
    warnings.push(`Invalid shipping value: "${po.shipping}"`);
  }

  const calculatedTotalUnits = calculatedSubtotalUnits + taxUnits + shippingUnits;

  let statedSubtotalUnits = 0;
  let statedTotalUnits = 0;
  try {
    statedSubtotalUnits = parseDecimalToMinorUnits(po.subtotal, minorUnits);
  } catch {
    warnings.push(`Invalid subtotal value: "${po.subtotal}"`);
  }
  try {
    statedTotalUnits = parseDecimalToMinorUnits(po.total_amount, minorUnits);
  } catch {
    warnings.push(`Invalid total amount value: "${po.total_amount}"`);
  }

  const subtotalValid = statedSubtotalUnits === 0 || calculatedSubtotalUnits === statedSubtotalUnits;
  const totalValid = statedTotalUnits === 0 || calculatedTotalUnits === statedTotalUnits;

  if (!subtotalValid && statedSubtotalUnits > 0) {
    warnings.push(
      `Subtotal mismatch: sum of line items (${minorUnitsToDecimalString(calculatedSubtotalUnits, minorUnits)}) does not equal stated subtotal (${minorUnitsToDecimalString(statedSubtotalUnits, minorUnits)})`
    );
  }
  if (!totalValid && statedTotalUnits > 0) {
    warnings.push(
      `Total amount mismatch: calculated (${minorUnitsToDecimalString(calculatedTotalUnits, minorUnits)}) does not equal stated total (${minorUnitsToDecimalString(statedTotalUnits, minorUnits)})`
    );
  }

  const overallValid =
    !currencyMismatch &&
    lineValidations.every((l) => l.is_valid) &&
    subtotalValid &&
    totalValid;

  return {
    is_valid: overallValid,
    currency,
    subtotal: minorUnitsToDecimalString(statedSubtotalUnits || calculatedSubtotalUnits, minorUnits),
    calculated_subtotal: minorUnitsToDecimalString(calculatedSubtotalUnits, minorUnits),
    total_amount: minorUnitsToDecimalString(statedTotalUnits || calculatedTotalUnits, minorUnits),
    calculated_total: minorUnitsToDecimalString(calculatedTotalUnits, minorUnits),
    line_item_validations: lineValidations,
    warnings,
    currency_mismatch: currencyMismatch,
  };
}

/**
 * Calculates payment term day variance (e.g., Net 30 vs Net 45 -> 15 days).
 */
export function calculatePaymentTermVarianceDays(
  contractTermStr: string | null | undefined,
  poTermStr: string | null | undefined
): { contractDays?: number; poDays?: number; varianceDays?: number } {
  const extractDays = (str: string | null | undefined): number | undefined => {
    if (!str) return undefined;
    const match = str.match(/(?:net|within|\b)(\d+)\s*(?:days?|d)?/i);
    return match ? parseInt(match[1], 10) : undefined;
  };

  const contractDays = extractDays(contractTermStr);
  const poDays = extractDays(poTermStr);

  const varianceDays =
    contractDays !== undefined && poDays !== undefined ? poDays - contractDays : undefined;

  return { contractDays, poDays, varianceDays };
}
