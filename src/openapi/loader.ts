import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validate } from "@scalar/openapi-parser";
import type { OpenAPI } from "@scalar/openapi-types";
import type { JsonObject, OpenApiContext } from "../types.js";
import { extractOperations } from "./operations.js";

const DEFAULT_TIMEOUT_MS = 10_000;

export interface LoadOpenApiOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  validationMode?: "compatible" | "strict";
}

export async function loadOpenApi(
  source: string,
  options: LoadOpenApiOptions = {},
): Promise<OpenApiContext> {
  const content = isHttpUrl(source)
    ? await fetchDocument(source, options)
    : await readFile(resolve(source), "utf8");

  return createOpenApiContext(content, source, options);
}

export async function createOpenApiContext(
  input: string | JsonObject,
  source = "memory",
  options: Pick<LoadOpenApiOptions, "validationMode"> = {},
): Promise<OpenApiContext> {
  const result = await validate(input);
  if (!result.valid) {
    const specification = result.specification;
    const compatibleErrors = specification
      ? result.errors.filter((error) => isCompatibleUnicodeReferenceError(error, specification))
      : [];
    const fatalErrors = result.errors.filter((error) => !compatibleErrors.includes(error));

    if (options.validationMode === "strict" || !specification || fatalErrors.length > 0) {
      throw new Error(`Invalid OpenAPI document: ${formatValidationErrors(result.errors)}`);
    }

    const document = specification as OpenAPI.Document;
    assertDocumentShape(document);
    return {
      document,
      source,
      version: result.version ?? getDocumentVersion(document),
      operations: extractOperations(document),
      validationWarnings: summarizeWarnings(compatibleErrors),
    };
  }

  const document = result.specification as OpenAPI.Document;
  return {
    document,
    source,
    version: result.version,
    operations: extractOperations(document),
    validationWarnings: [],
  };
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

async function fetchDocument(
  url: string,
  options: LoadOpenApiOptions,
): Promise<string> {
  const response = await fetch(url, {
    ...(options.headers ? { headers: options.headers } : {}),
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to load OpenAPI document: ${response.status} ${response.statusText}`,
    );
  }

  return response.text();
}

function isCompatibleUnicodeReferenceError(
  error: { message: string; path?: string[] | string },
  document: JsonObject,
): boolean {
  const messageMatches =
    error.message === "Property $ref is not expected to be here" ||
    error.message.includes("contains non-ASCII characters");
  if (!messageMatches || typeof error.path !== "string") return false;

  const value = resolveJsonPointer(document, error.path);
  const ref =
    typeof value === "string"
      ? value
      : value && typeof value === "object"
        ? (value as JsonObject).$ref
        : undefined;
  if (typeof ref !== "string" || !ref.startsWith("#/") || !/[^\x00-\x7F]/.test(ref)) {
    return false;
  }
  return resolveJsonPointer(document, ref.slice(1)) !== undefined;
}

function resolveJsonPointer(root: unknown, pointer: string): unknown {
  if (pointer === "") return root;
  if (!pointer.startsWith("/")) return undefined;
  let current = root;
  for (const rawPart of pointer.slice(1).split("/")) {
    const part = decodeURIComponent(rawPart.replace(/~1/g, "/").replace(/~0/g, "~"));
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as JsonObject)[part];
  }
  return current;
}

function formatValidationErrors(
  errors: Array<{ message: string; path?: string[] | string }>,
): string {
  return errors
    .slice(0, 20)
    .map((error) => {
      const path = Array.isArray(error.path)
        ? error.path.join(".")
        : typeof error.path === "string"
          ? error.path
          : "document";
      return `${path}: ${error.message}`;
    })
    .join("; ");
}

function summarizeWarnings(errors: Array<{ message: string }>) {
  const counts = new Map<string, number>();
  for (const error of errors) {
    const message = error.message.includes("contains non-ASCII characters")
      ? "Local $ref contains non-ASCII characters"
      : error.message;
    counts.set(message, (counts.get(message) ?? 0) + 1);
  }
  return [...counts.entries()].map(([message, count]) => ({ message, count }));
}

function assertDocumentShape(document: OpenAPI.Document): void {
  const root = document as unknown as JsonObject;
  if (typeof root.openapi !== "string" && typeof root.swagger !== "string") {
    throw new Error("Invalid OpenAPI document: missing openapi or swagger version");
  }
  if (!root.info || typeof root.info !== "object") {
    throw new Error("Invalid OpenAPI document: missing info object");
  }
  if (!root.paths || typeof root.paths !== "object") {
    throw new Error("Invalid OpenAPI document: missing paths object");
  }
}

function getDocumentVersion(document: OpenAPI.Document): string {
  const root = document as unknown as JsonObject;
  const value = typeof root.openapi === "string" ? root.openapi : root.swagger;
  return typeof value === "string" ? value : "unknown";
}
