import type { OperationEntry, SearchOptions, SearchResult } from "../types.js";

const FIELD_WEIGHTS = {
  summary: 10,
  tags: 8,
  path: 6,
  description: 4,
  operationId: 2,
} as const;

export function searchOperations(
  operations: OperationEntry[],
  options: SearchOptions,
): SearchResult[] {
  const query = normalize(options.query);
  const method = options.method?.toLowerCase();
  const tag = options.tag ? normalize(options.tag) : undefined;
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);

  return operations
    .filter((entry) => !method || entry.method === method)
    .filter((entry) => !tag || entry.tags.some((value) => normalize(value) === tag))
    .map((entry) => scoreEntry(entry, query))
    .filter((result) => query.length === 0 || result.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}

function scoreEntry(entry: OperationEntry, query: string): SearchResult {
  const fields: Record<keyof typeof FIELD_WEIGHTS, string> = {
    summary: entry.summary ?? "",
    tags: entry.tags.join(" "),
    path: entry.path,
    description: entry.description ?? "",
    operationId: entry.operationId ?? "",
  };
  let score = 0;
  const matchedFields: string[] = [];

  for (const [field, weight] of Object.entries(FIELD_WEIGHTS) as Array<
    [keyof typeof FIELD_WEIGHTS, number]
  >) {
    const similarity = fieldScore(query, normalize(fields[field]));
    if (similarity > 0) {
      score += similarity * weight;
      matchedFields.push(field);
    }
  }

  const queryCoverage = calculateQueryCoverage(query, Object.values(fields));
  score *= queryCoverage ** 3;

  const result: SearchResult = {
    id: entry.id,
    method: entry.method.toUpperCase(),
    path: entry.path,
    tags: entry.tags,
    score: Number(score.toFixed(3)),
    queryCoverage: Number(queryCoverage.toFixed(3)),
    matchedFields,
  };
  if (entry.summary !== undefined) result.summary = entry.summary;
  if (entry.description !== undefined) result.description = entry.description;
  return result;
}

function calculateQueryCoverage(query: string, fields: string[]): number {
  if (!query) return 1;
  const queryGrams = new Set(toGrams(query));
  if (queryGrams.size === 0) return 0;
  const fieldGrams = new Set(
    fields.flatMap((field) => toGrams(normalize(field))),
  );
  let matches = 0;
  for (const gram of queryGrams) {
    if (fieldGrams.has(gram)) matches += 1;
  }
  return matches / queryGrams.size;
}

function fieldScore(query: string, field: string): number {
  if (!query || !field) return 0;
  if (query === field) return 1;
  if (field.includes(query)) return 0.86 + Math.min(query.length / field.length, 1) * 0.1;

  const terms = splitTerms(query);
  const matchedTerms = terms.filter((term) => field.includes(term));
  const termScore = terms.length > 0 ? matchedTerms.length / terms.length : 0;
  const gramScore = diceCoefficient(toGrams(query), toGrams(field));
  const score = Math.max(termScore * 0.8, gramScore * 0.7);
  return score >= 0.08 ? score : 0;
}

export function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}_]+/gu, "");
}

function splitTerms(value: string): string[] {
  const raw = value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .split(/[\s\p{P}\p{S}_]+/gu)
    .filter(Boolean);
  return raw.length > 1 ? raw.map(normalize).filter(Boolean) : toGrams(normalize(value));
}

function toGrams(value: string): string[] {
  const chars = Array.from(value);
  if (chars.length <= 2) return chars.length ? [chars.join("")] : [];
  const grams = new Set<string>();
  for (let index = 0; index < chars.length - 1; index += 1) {
    grams.add(chars.slice(index, index + 2).join(""));
  }
  for (let index = 0; index < chars.length - 2; index += 1) {
    grams.add(chars.slice(index, index + 3).join(""));
  }
  return [...grams];
}

function diceCoefficient(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  const intersection = left.filter((value) => rightSet.has(value)).length;
  return (2 * intersection) / (left.length + rightSet.size);
}
