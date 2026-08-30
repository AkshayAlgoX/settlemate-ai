const TIMEZONE_BUSINESS = "Asia/Kolkata";
const LOCALE_DETERMINISTIC = "en-US";
const LOCALE_INDIAN = "en-IN";

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function formatCurrency(paise: number): string {
  const rupees = paiseToRupees(paise);
  return new Intl.NumberFormat(LOCALE_INDIAN, {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

export function formatCurrencyShort(paise: number): string {
  const rupees = paiseToRupees(paise);
  if (rupees >= 10000000) return `₹${(rupees / 10000000).toFixed(1)}Cr`;
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}K`;
  return `₹${rupees.toFixed(0)}`;
}

/**
 * Deterministic audit/ledger timestamp formatter.
 * Produces identical string (e.g. "4:15:00 PM") across Server (Node) and Client (Browsers).
 */
export function formatAuditTime(date: Date | string | number): string {
  if (!date) return "—";
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat(LOCALE_DETERMINISTIC, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: TIMEZONE_BUSINESS,
  })
    .format(d)
    .replace(/[\u202F\u00A0]/g, " ")
    .replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase());
}

/**
 * Deterministic time formatter with optional seconds.
 */
export function formatTime(date: Date | string | number, includeSeconds = true): string {
  if (!date) return "—";
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat(LOCALE_DETERMINISTIC, {
    hour: "numeric",
    minute: "2-digit",
    second: includeSeconds ? "2-digit" : undefined,
    hour12: true,
    timeZone: TIMEZONE_BUSINESS,
  })
    .format(d)
    .replace(/[\u202F\u00A0]/g, " ")
    .replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase());
}

/**
 * Deterministic date formatter with time (e.g. "21 Aug 2026, 04:15 PM").
 */
export function formatDate(date: Date | string | number): string {
  if (!date) return "—";
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat(LOCALE_INDIAN, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: TIMEZONE_BUSINESS,
  })
    .format(d)
    .replace(/[\u202F\u00A0]/g, " ")
    .replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase());
}

/**
 * Deterministic date-only formatter (e.g. "21 Aug 2026").
 */
export function formatDateOnly(date: Date | string | number): string {
  if (!date) return "—";
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat(LOCALE_INDIAN, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: TIMEZONE_BUSINESS,
  })
    .format(d)
    .replace(/[\u202F\u00A0]/g, " ");
}

/**
 * Deterministic full date-time formatter with seconds (e.g. "21 Aug 2026, 04:15:00 PM").
 */
export function formatDateTime(date: Date | string | number): string {
  if (!date) return "—";
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat(LOCALE_INDIAN, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: TIMEZONE_BUSINESS,
  })
    .format(d)
    .replace(/[\u202F\u00A0]/g, " ")
    .replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase());
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}