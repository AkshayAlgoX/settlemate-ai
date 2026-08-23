/*
 * SettleMate AI — Fast Streaming CSV Parser & Tokenizer
 */

export function parseCsvLines(csvText: string): string[][] {
  const lines: string[][] = [];
  const clean = csvText
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const rawLines = clean.split("\n");

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const row: string[] = [];
    let insideQuotes = false;
    let currentField = "";

    for (let i = 0; i < rawLine.length; i++) {
      const char = rawLine[i];
      if (char === '"') {
        if (insideQuotes && rawLine[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === "," && !insideQuotes) {
        row.push(currentField.trim());
        currentField = "";
      } else {
        currentField += char;
      }
    }
    row.push(currentField.trim());
    lines.push(row);
  }

  return lines;
}

export function parseAmountToPaise(val: string | number | undefined | null): number {
  if (val == null) return 0;
  if (typeof val === "number") return Math.round(val);
  const clean = val.replace(/[^0-9.-]/g, "");
  const num = parseFloat(clean);
  if (isNaN(num)) return 0;
  // If value contains a decimal dot (e.g. 100.50), convert to paise (* 100)
  if (val.includes(".")) {
    return Math.round(num * 100);
  }
  return Math.round(num);
}

export function parseDateFlexible(val: string | undefined | null): Date {
  if (!val) return new Date();
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d;

  // Try DD/MM/YYYY or DD-MM-YYYY
  const parts = val.split(/[-/ :]/);
  if (parts.length >= 3) {
    const p0 = parseInt(parts[0]!, 10);
    const p1 = parseInt(parts[1]!, 10) - 1;
    const p2 = parseInt(parts[2]!, 10);
    const d2 = new Date(Date.UTC(p2 > 100 ? p2 : 2000 + p2, p1, p0));
    if (!isNaN(d2.getTime())) return d2;
  }
  return new Date();
}
