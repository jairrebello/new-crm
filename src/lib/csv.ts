export type ParsedCsv = {
  headers: string[]
  rows: string[][]
}

function detectDelimiter(sampleLine: string): ',' | ';' | '\t' {
  const comma = (sampleLine.match(/,/g) ?? []).length
  const semicolon = (sampleLine.match(/;/g) ?? []).length
  const tab = (sampleLine.match(/\t/g) ?? []).length
  if (tab >= comma && tab >= semicolon) return '\t'
  return semicolon > comma ? ';' : ','
}

function parseLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]

    if (inQuotes) {
      if (ch === '"') {
        const next = line[i + 1]
        if (next === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
      continue
    }

    if (ch === delimiter) {
      out.push(cur.trim())
      cur = ''
      continue
    }

    cur += ch
  }

  out.push(cur.trim())
  return out
}

export function parseCsvText(text: string): ParsedCsv {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)

  if (lines.length === 0) return { headers: [], rows: [] }

  const delimiter = detectDelimiter(lines[0] ?? '')
  const headers = parseLine(lines[0] ?? '', delimiter).map((h) => h.trim())
  const rows = lines.slice(1).map((l) => parseLine(l, delimiter))

  return { headers, rows }
}

