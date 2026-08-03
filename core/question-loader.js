export async function loadQuestions(csvPath) {
  const res = await fetch(csvPath);

  if (!res.ok) {
    throw new Error(`CSV読込失敗: ${csvPath}`);
  }

  const text = await res.text();
  return parseDelimitedText(text);
}

export function parseDelimitedText(text) {
  const normalizedText = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalizedText
    .split("\n")
    .filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    return [];
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitDelimitedLine(lines[0], delimiter).map((header) => normalizeCell(header));

  return lines.slice(1).map((line) => {
    const values = splitDelimitedLine(line, delimiter);
    const row = {};

    headers.forEach((header, i) => {
      row[header] = normalizeCell(values[i] ?? "");
    });

    return row;
  });
}

export function detectDelimiter(headerLine) {
  const commaCount = countDelimiterOutsideQuotes(headerLine, ",");
  const tabCount = countDelimiterOutsideQuotes(headerLine, "\t");

  if (tabCount > commaCount) {
    return "\t";
  }

  return ",";
}

function countDelimiterOutsideQuotes(line, delimiter) {
  let count = 0;
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      count += 1;
    }
  }

  return count;
}

export function splitDelimitedLine(line, delimiter) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

function normalizeCell(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .trim();
}