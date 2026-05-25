export function parseDelimitedTable(text: string) {
  const parsedRows = parseDelimitedRows(text);

  if (parsedRows.length === 0) {
    return { headers: [] as string[], rows: [] as Record<string, unknown>[] };
  }

  const headers = parsedRows[0].filter(Boolean);
  const rows = parsedRows.slice(1).map((values) => {
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]));
  });

  return { headers, rows };
}

export function parseDelimitedRows(text: string) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return [] as string[][];
  }

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  return lines.map((line) => splitLine(line, delimiter).map((value) => value.trim()));
}

function splitLine(line: string, delimiter: string) {
  if (delimiter === "\t") return line.split("\t");

  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}
