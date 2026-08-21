import type { OpenAPI } from "@scalar/openapi-types";

export type JsonObject = Record<string, unknown>;
export type HttpMethod =
  | "get"
  | "put"
  | "post"
  | "delete"
  | "options"
  | "head"
  | "patch"
  | "trace"
  | "query";

export interface OperationEntry {
  id: string;
  method: HttpMethod;
  path: string;
  summary?: string;
  description?: string;
  operationId?: string;
  tags: string[];
  operation: JsonObject;
  pathItem: JsonObject;
}

export interface SearchOptions {
  query: string;
  method?: string;
  tag?: string;
  limit?: number;
}

export interface SearchResult {
  id: string;
  method: string;
  path: string;
  summary?: string;
  description?: string;
  tags: string[];
  score: number;
  queryCoverage: number;
  matchedFields: string[];
}

export interface OpenApiContext {
  document: OpenAPI.Document;
  source: string;
  version: string;
  operations: OperationEntry[];
  validationWarnings: Array<{ message: string; count: number }>;
  diagnostics: OpenApiDiagnostic[];
}

export type DiagnosticSeverity = "repair" | "warning" | "skipped";

export type DiagnosticCode =
  | "ref_repaired"
  | "ref_unresolved"
  | "ref_ambiguous"
  | "path_skipped"
  | "operation_skipped"
  | "responses_added"
  | "duplicate_operation_id"
  | "validation_warning";

export interface OpenApiDiagnostic {
  severity: DiagnosticSeverity;
  code: DiagnosticCode;
  path: string;
  message: string;
  original?: unknown;
  replacement?: unknown;
}

export interface SchemaFormatOptions {
  maxDepth?: number;
  maxProperties?: number;
}
