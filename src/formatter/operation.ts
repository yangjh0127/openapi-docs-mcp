import type { OpenAPI } from "@scalar/openapi-types";
import type { JsonObject, OperationEntry, SchemaFormatOptions } from "../types.js";
import { asObject, asString } from "../openapi/operations.js";
import { formatSchema, resolveLocalReference } from "./schema.js";

export function formatOperation(
  document: OpenAPI.Document,
  entry: OperationEntry,
  options: SchemaFormatOptions = {},
): JsonObject {
  const operation = entry.operation;
  const parameters = [
    ...asArray(entry.pathItem.parameters),
    ...asArray(operation.parameters),
  ].map((parameter) => formatParameter(document, parameter, options));

  const result: JsonObject = {
    id: entry.id,
    method: entry.method.toUpperCase(),
    path: entry.path,
    tags: entry.tags,
    parameters,
    responses: formatResponses(document, operation.responses, options),
  };
  copyIfDefined(result, "summary", entry.summary);
  copyIfDefined(result, "description", entry.description);
  copyIfDefined(result, "operationId", entry.operationId);
  copyIfDefined(result, "deprecated", operation.deprecated);
  copyIfDefined(result, "security", operation.security);

  const requestBody = asObject(operation.requestBody);
  if (requestBody) result.requestBody = formatRequestBody(document, requestBody, options);

  return result;
}

function formatParameter(
  document: OpenAPI.Document,
  rawParameter: unknown,
  options: SchemaFormatOptions,
): unknown {
  const parameter = asObject(rawParameter);
  if (!parameter) return rawParameter;
  const ref = asString(parameter.$ref);
  if (ref) {
    const resolved = resolveLocalReference(document, ref);
    return referenceEnvelope(
      ref,
      resolved === undefined
        ? undefined
        : formatParameter(document, withoutSameReference(resolved, ref), options),
      "parameter",
    );
  }

  const result: JsonObject = {};
  for (const key of ["name", "in", "required", "description", "deprecated", "style", "explode"]) {
    copyIfDefined(result, key, parameter[key]);
  }
  if (parameter.schema !== undefined) {
    result.schema = formatSchema(document, parameter.schema, options);
  }
  if (parameter.content !== undefined) {
    result.content = formatContent(document, parameter.content, options);
  }
  return result;
}

function formatRequestBody(
  document: OpenAPI.Document,
  requestBody: JsonObject,
  options: SchemaFormatOptions,
): unknown {
  const ref = asString(requestBody.$ref);
  if (ref) {
    const resolved = resolveLocalReference(document, ref);
    const body = asObject(withoutSameReference(resolved, ref));
    return referenceEnvelope(
      ref,
      body ? formatRequestBody(document, body, options) : undefined,
      "requestBody",
    );
  }
  const result: JsonObject = {
    required: requestBody.required === true,
    content: formatContent(document, requestBody.content, options),
  };
  copyIfDefined(result, "description", requestBody.description);
  return result;
}

function formatResponses(
  document: OpenAPI.Document,
  rawResponses: unknown,
  options: SchemaFormatOptions,
): JsonObject {
  const responses = asObject(rawResponses);
  if (!responses) return {};
  return Object.fromEntries(
    Object.entries(responses).map(([status, rawResponse]) => {
      const response = asObject(rawResponse);
      if (!response) return [status, rawResponse];
      const ref = asString(response.$ref);
      if (ref) {
        const resolved = asObject(withoutSameReference(resolveLocalReference(document, ref), ref));
        return [
          status,
          referenceEnvelope(
            ref,
            resolved
              ? formatResponses(document, { resolved }, options).resolved
              : undefined,
            "response",
          ),
        ];
      }
      const formatted: JsonObject = {};
      copyIfDefined(formatted, "description", response.description);
      if (response.headers !== undefined) formatted.headers = response.headers;
      if (response.content !== undefined) {
        formatted.content = formatContent(document, response.content, options);
      }
      if (response.schema !== undefined) {
        formatted.schema = formatSchema(document, response.schema, options);
      }
      return [status, formatted];
    }),
  );
}

function formatContent(
  document: OpenAPI.Document,
  rawContent: unknown,
  options: SchemaFormatOptions,
): JsonObject {
  const content = asObject(rawContent);
  if (!content) return {};
  return Object.fromEntries(
    Object.entries(content).map(([mediaType, rawMedia]) => {
      const media = asObject(rawMedia);
      if (!media) return [mediaType, rawMedia];
      const formatted: JsonObject = {};
      if (media.schema !== undefined) {
        formatted.schema = formatSchema(document, media.schema, options);
      }
      copyIfDefined(formatted, "example", media.example);
      copyIfDefined(formatted, "examples", media.examples);
      copyIfDefined(formatted, "encoding", media.encoding);
      return [mediaType, formatted];
    }),
  );
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function copyIfDefined(target: JsonObject, key: string, value: unknown): void {
  if (value !== undefined) target[key] = value;
}

function referenceEnvelope(ref: string, value: unknown, key: string): JsonObject {
  const result: JsonObject = {
    $ref: ref,
    name: decodeURIComponent(ref.split("/").at(-1) ?? ref),
  };
  if (value === undefined) result.unresolved = true;
  else result[key] = value;
  return result;
}

function withoutSameReference(value: unknown, ref: string): unknown {
  const object = asObject(value);
  return object?.$ref === ref ? undefined : value;
}
