import type { JsonObject, OpenApiDiagnostic } from "../types.js";
import { HTTP_METHODS, asObject } from "./operations.js";

interface ReferenceTarget {
  name: string;
  pointer: string;
}

export interface NormalizeResult {
  document: JsonObject;
  diagnostics: OpenApiDiagnostic[];
}

export function normalizeOpenApiDocument(input: JsonObject): NormalizeResult {
  const document = structuredClone(input);
  const diagnostics: OpenApiDiagnostic[] = [];
  const targets = collectReferenceTargets(document);
  walkAndRepairReferences(document, "", document, targets, diagnostics);
  normalizePaths(document, diagnostics);
  reportDuplicateOperationIds(document, diagnostics);
  return { document, diagnostics };
}

function normalizePaths(
  document: JsonObject,
  diagnostics: OpenApiDiagnostic[],
): void {
  const paths = asObject(document.paths);
  if (!paths) return;

  for (const [path, rawPathItem] of Object.entries(paths)) {
    const location = `/paths/${encodePointerSegment(path)}`;
    const pathItem = asObject(rawPathItem);
    if (!pathItem) {
      delete paths[path];
      diagnostics.push({
        severity: "skipped",
        code: "path_skipped",
        path: location,
        message: "Skipped path because its path item is not an object",
        original: rawPathItem,
      });
      continue;
    }

    for (const method of HTTP_METHODS) {
      if (pathItem[method] === undefined) continue;
      const operation = asObject(pathItem[method]);
      const operationPath = `${location}/${method}`;
      if (!operation) {
        const original = pathItem[method];
        delete pathItem[method];
        diagnostics.push({
          severity: "skipped",
          code: "operation_skipped",
          path: operationPath,
          message: "Skipped operation because it is not an object",
          original,
        });
        continue;
      }
      if (operation.responses === undefined) {
        operation.responses = {};
        diagnostics.push({
          severity: "repair",
          code: "responses_added",
          path: `${operationPath}/responses`,
          message: "Added an empty responses object",
          replacement: {},
        });
      }
    }
  }
}

function reportDuplicateOperationIds(
  document: JsonObject,
  diagnostics: OpenApiDiagnostic[],
): void {
  const paths = asObject(document.paths);
  if (!paths) return;

  const occurrences = new Map<string, string[]>();
  for (const [path, rawPathItem] of Object.entries(paths)) {
    const pathItem = asObject(rawPathItem);
    if (!pathItem) continue;
    for (const method of HTTP_METHODS) {
      const operation = asObject(pathItem[method]);
      const operationId = operation?.operationId;
      if (typeof operationId !== "string" || operationId.length === 0) continue;
      const location = `/paths/${encodePointerSegment(path)}/${method}/operationId`;
      const locations = occurrences.get(operationId) ?? [];
      locations.push(location);
      occurrences.set(operationId, locations);
    }
  }

  for (const [operationId, locations] of occurrences) {
    if (locations.length < 2) continue;
    for (const path of locations) {
      diagnostics.push({
        severity: "warning",
        code: "duplicate_operation_id",
        path,
        message: `Duplicate operationId: ${operationId}`,
        original: operationId,
      });
    }
  }
}

function collectReferenceTargets(document: JsonObject): ReferenceTarget[] {
  const targets: ReferenceTarget[] = [];
  const components = asObject(document.components);
  for (const collection of ["schemas", "parameters", "responses", "requestBodies"]) {
    const entries = asObject(components?.[collection]);
    if (!entries) continue;
    for (const name of Object.keys(entries)) {
      targets.push({
        name,
        pointer: `#/components/${collection}/${encodePointerSegment(name)}`,
      });
    }
  }

  const definitions = asObject(document.definitions);
  if (definitions) {
    for (const name of Object.keys(definitions)) {
      targets.push({ name, pointer: `#/definitions/${encodePointerSegment(name)}` });
    }
  }
  return targets;
}

function walkAndRepairReferences(
  value: unknown,
  path: string,
  document: JsonObject,
  targets: ReferenceTarget[],
  diagnostics: OpenApiDiagnostic[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walkAndRepairReferences(item, `${path}/${index}`, document, targets, diagnostics),
    );
    return;
  }

  const object = asObject(value);
  if (!object) return;

  const ref = object.$ref;
  if (typeof ref === "string") {
    repairReference(object, ref, `${path}/$ref`, document, targets, diagnostics);
  }

  for (const [key, child] of Object.entries(object)) {
    if (key === "$ref") continue;
    walkAndRepairReferences(
      child,
      `${path}/${encodePointerSegment(key)}`,
      document,
      targets,
      diagnostics,
    );
  }
}

function repairReference(
  owner: JsonObject,
  ref: string,
  path: string,
  document: JsonObject,
  targets: ReferenceTarget[],
  diagnostics: OpenApiDiagnostic[],
): void {
  if (isExternalReference(ref) || resolveLocalReference(document, ref) !== undefined) return;

  const name = referenceName(ref);
  const matches = targets.filter((target) => target.name === name);
  if (matches.length === 1) {
    const replacement = matches[0]!.pointer;
    owner.$ref = replacement;
    diagnostics.push({
      severity: "repair",
      code: "ref_repaired",
      path,
      message: `Repaired local reference to ${replacement}`,
      original: ref,
      replacement,
    });
    return;
  }

  diagnostics.push({
    severity: "warning",
    code: matches.length > 1 ? "ref_ambiguous" : "ref_unresolved",
    path,
    message:
      matches.length > 1
        ? `Local reference matches ${matches.length} component targets`
        : "Local reference target was not found",
    original: ref,
  });
}

function referenceName(ref: string): string {
  const prefixes = [
    "#/components/schemas/",
    "#/components/parameters/",
    "#/components/responses/",
    "#/components/requestBodies/",
    "#/definitions/",
  ];
  const prefix = prefixes.find((candidate) => ref.startsWith(candidate));
  return decodeOnce(prefix ? ref.slice(prefix.length) : ref)
    .replace(/~1/g, "/")
    .replace(/~0/g, "~");
}

function isExternalReference(ref: string): boolean {
  return (
    /^[a-z][a-z\d+.-]*:/i.test(ref) ||
    /^(?:\.\.?\/|\/)/.test(ref) ||
    ref.indexOf("#") > 0 ||
    /\.(?:json|ya?ml)$/i.test(ref)
  );
}

function resolveLocalReference(document: JsonObject, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  let current: unknown = document;
  for (const rawPart of ref.slice(2).split("/")) {
    const part = decodeOnce(rawPart).replace(/~1/g, "/").replace(/~0/g, "~");
    current = asObject(current)?.[part];
    if (current === undefined) return undefined;
  }
  return current;
}

function encodePointerSegment(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function decodeOnce(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
