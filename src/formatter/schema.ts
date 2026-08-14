import type { OpenAPI } from "@scalar/openapi-types";
import type { JsonObject, SchemaFormatOptions } from "../types.js";
import { asObject, asString } from "../openapi/operations.js";

interface FormatState {
  depth: number;
  references: Set<string>;
}

export function formatSchema(
  document: OpenAPI.Document,
  schema: unknown,
  options: SchemaFormatOptions = {},
): unknown {
  return formatSchemaNode(document, schema, {
    maxDepth: options.maxDepth ?? 5,
    maxProperties: options.maxProperties ?? 100,
  }, { depth: 0, references: new Set() });
}

export function listSchemaNames(document: OpenAPI.Document): string[] {
  const root = document as unknown as JsonObject;
  const components = asObject(root.components);
  const schemas = asObject(components?.schemas) ?? asObject(root.definitions);
  return schemas ? Object.keys(schemas).sort((a, b) => a.localeCompare(b)) : [];
}

export function findSchema(document: OpenAPI.Document, name: string): unknown {
  const root = document as unknown as JsonObject;
  const components = asObject(root.components);
  const schemas = asObject(components?.schemas) ?? asObject(root.definitions);
  return schemas?.[name];
}

function formatSchemaNode(
  document: OpenAPI.Document,
  rawSchema: unknown,
  options: Required<SchemaFormatOptions>,
  state: FormatState,
): unknown {
  if (typeof rawSchema === "boolean") return rawSchema;
  const schema = asObject(rawSchema);
  if (!schema) return rawSchema ?? null;

  const ref = asString(schema.$ref);
  if (ref) {
    const refName = decodeURIComponent(ref.split("/").at(-1) ?? ref);
    if (state.references.has(ref)) {
      return { $ref: ref, name: refName, circular: true };
    }
    if (state.depth >= options.maxDepth) {
      return { $ref: ref, name: refName, truncated: "maxDepth" };
    }
    const resolved = resolveLocalReference(document, ref);
    if (resolved === undefined) return { $ref: ref, name: refName, unresolved: true };

    const references = new Set(state.references);
    references.add(ref);
    return {
      $ref: ref,
      name: refName,
      schema: formatSchemaNode(document, resolved, options, {
        depth: state.depth + 1,
        references,
      }),
    };
  }

  if (state.depth >= options.maxDepth) {
    return { type: schema.type ?? "object", truncated: "maxDepth" };
  }

  const output: JsonObject = {};
  copyKnownValues(schema, output, [
    "type",
    "format",
    "title",
    "description",
    "nullable",
    "readOnly",
    "writeOnly",
    "deprecated",
    "default",
    "example",
    "examples",
    "enum",
    "const",
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
    "pattern",
  ]);

  if (Array.isArray(schema.required)) output.required = schema.required;

  const properties = asObject(schema.properties);
  if (properties) {
    const entries = Object.entries(properties);
    output.properties = Object.fromEntries(
      entries.slice(0, options.maxProperties).map(([name, value]) => [
        name,
        formatSchemaNode(document, value, options, {
          depth: state.depth + 1,
          references: new Set(state.references),
        }),
      ]),
    );
    if (entries.length > options.maxProperties) {
      output.truncatedProperties = entries.length - options.maxProperties;
    }
  }

  if (schema.items !== undefined) {
    output.items = formatSchemaNode(document, schema.items, options, {
      depth: state.depth + 1,
      references: new Set(state.references),
    });
  }

  if (schema.additionalProperties !== undefined) {
    output.additionalProperties =
      typeof schema.additionalProperties === "boolean"
        ? schema.additionalProperties
        : formatSchemaNode(document, schema.additionalProperties, options, {
            depth: state.depth + 1,
            references: new Set(state.references),
          });
  }

  for (const keyword of ["allOf", "oneOf", "anyOf"] as const) {
    const variants = schema[keyword];
    if (Array.isArray(variants)) {
      output[keyword] = variants.map((variant) =>
        formatSchemaNode(document, variant, options, {
          depth: state.depth + 1,
          references: new Set(state.references),
        }),
      );
    }
  }

  if (schema.not !== undefined) {
    output.not = formatSchemaNode(document, schema.not, options, {
      depth: state.depth + 1,
      references: new Set(state.references),
    });
  }

  return output;
}

export function resolveLocalReference(document: OpenAPI.Document, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  const parts = ref
    .slice(2)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current: unknown = document;
  for (const part of parts) {
    current = asObject(current)?.[part];
    if (current === undefined) return undefined;
  }
  return current;
}

function copyKnownValues(source: JsonObject, target: JsonObject, keys: string[]): void {
  for (const key of keys) {
    if (source[key] !== undefined) target[key] = source[key];
  }
}
