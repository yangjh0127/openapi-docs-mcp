import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validate } from "@scalar/openapi-parser";
import type { OpenAPI } from "@scalar/openapi-types";
import type { JsonObject, OpenApiContext, OpenApiDiagnostic } from "../types.js";
import { normalizeOpenApiDocument } from "./normalize.js";
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
  const initial = await validateInput(input);
  const initialErrors = initial.errors ?? [];
  if (options.validationMode === "strict") {
    if (!initial.valid || !initial.specification) {
      throw invalidDocument(initialErrors);
    }
    const document = initial.specification as OpenAPI.Document;
    return {
      document,
      source,
      version: initial.version ?? getDocumentVersion(document),
      operations: extractOperations(document),
      validationWarnings: [],
      diagnostics: [],
    };
  }

  if (!initial.specification) throw invalidDocument(initialErrors);
  const parsed = initial.specification as unknown as OpenAPI.Document;
  assertDocumentShape(parsed);

  const normalized = normalizeOpenApiDocument(parsed as unknown as JsonObject);
  const result = await validateInput(normalized.document);
  const resultErrors = result.errors ?? [];
  const fatalErrors = resultErrors.filter(isFatalValidationError);
  if (!result.specification || fatalErrors.length > 0) {
    throw invalidDocument(fatalErrors.length ? fatalErrors : resultErrors);
  }

  const document = result.specification as OpenAPI.Document;
  assertDocumentShape(document);
  return {
    document,
    source,
    version: result.version ?? getDocumentVersion(document),
    operations: extractOperations(document),
    validationWarnings: summarizeWarnings(resultErrors),
    diagnostics: [
      ...normalized.diagnostics,
      ...resultErrors.map(toValidationDiagnostic),
    ],
  };
}

async function validateInput(input: string | JsonObject) {
  try {
    return await validate(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid OpenAPI document: ${message}`, { cause: error });
  }
}

function invalidDocument(
  errors: Array<{ message: string; path?: string[] | string }>,
): Error {
  return new Error(`Invalid OpenAPI document: ${formatValidationErrors(errors)}`);
}

function isFatalValidationError(error: {
  message: string;
  path?: string[] | string;
}): boolean {
  const path = validationPath(error);
  return (
    path === "" ||
    /^\/(?:openapi|swagger|info)(?:\/|$)/.test(path) ||
    path === "/paths"
  );
}

function toValidationDiagnostic(error: {
  message: string;
  path?: string[] | string;
}): OpenApiDiagnostic {
  return {
    severity: "warning",
    code: "validation_warning",
    path: validationPath(error),
    message: error.message,
  };
}

function validationPath(error: { path?: string[] | string }): string {
  return Array.isArray(error.path)
    ? `/${error.path.join("/")}`
    : typeof error.path === "string"
      ? error.path
      : "";
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
