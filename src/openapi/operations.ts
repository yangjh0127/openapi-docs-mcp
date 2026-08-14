import type { OpenAPI } from "@scalar/openapi-types";
import type { HttpMethod, JsonObject, OperationEntry } from "../types.js";

export const HTTP_METHODS: readonly HttpMethod[] = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
  "query",
];

export function extractOperations(document: OpenAPI.Document): OperationEntry[] {
  const root = document as unknown as JsonObject;
  const paths = asObject(root.paths);
  if (!paths) return [];

  const operations: OperationEntry[] = [];
  for (const [path, rawPathItem] of Object.entries(paths)) {
    const pathItem = asObject(rawPathItem);
    if (!pathItem) continue;

    for (const method of HTTP_METHODS) {
      const operation = asObject(pathItem[method]);
      if (!operation) continue;

      const operationId = asString(operation.operationId);
      const entry: OperationEntry = {
        id: operationId || `${method.toUpperCase()} ${path}`,
        method,
        path,
        tags: asStringArray(operation.tags),
        operation,
        pathItem,
      };
      const summary = asString(operation.summary);
      const description = asString(operation.description);
      if (summary) entry.summary = summary;
      if (description) entry.description = description;
      if (operationId) entry.operationId = operationId;
      operations.push(entry);
    }
  }

  return operations.sort((a, b) =>
    a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );
}

export function findOperation(
  operations: OperationEntry[],
  input: { id?: string; path?: string; method?: string },
): OperationEntry | undefined {
  if (input.id) {
    const exact = operations.find((entry) => entry.id === input.id);
    if (exact) return exact;
  }

  if (input.path) {
    const method = input.method?.toLowerCase();
    return operations.find(
      (entry) => entry.path === input.path && (!method || entry.method === method),
    );
  }

  return undefined;
}

export function asObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

