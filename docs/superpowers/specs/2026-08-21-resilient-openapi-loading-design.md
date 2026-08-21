# Resilient OpenAPI Loading Design

## Goal

Allow the MCP server to start and expose every usable operation when an OpenAPI document contains localized, recoverable defects, while keeping strict validation available and never silently guessing when a repair is ambiguous.

## Scope

The change applies only to document ingestion and diagnostics. Search, operation formatting, schema formatting, and MCP tool contracts remain unchanged.

Compatible mode remains the default. Strict mode continues to reject every OpenAPI validation error and does not apply compatibility repairs.

## Loading Pipeline

Compatible loading is split into four stages:

1. Parse the source into a JSON-like object. Invalid JSON or YAML remains fatal.
2. Normalize defects that can be repaired deterministically, recording one diagnostic for every repair.
3. Validate the normalized document with `@scalar/openapi-parser`.
4. Extract usable operations and return structured diagnostics. Local defects that cannot affect the rest of the document are downgraded to warnings; unusable operations are skipped individually.

The original input is not mutated. Normalization works on a cloned document so callers that pass an object retain ownership of their value.

## Deterministic Reference Repair

The normalizer walks every object and examines `$ref` string values.

It accepts valid local references unchanged. For malformed references, it builds candidates from the exact names under `components.schemas`, `components.parameters`, `components.responses`, `components.requestBodies`, and the OpenAPI 2 `definitions` collection.

A reference may be repaired when exactly one candidate matches after applying these transformations:

- add a missing local component prefix;
- decode percent-encoded text once;
- encode a component key as a JSON Pointer segment, replacing `~` with `~0` and `/` with `~1`;
- tolerate a leading `#/definitions/` versus `#/components/schemas/` mismatch only when the named target exists in exactly one supported collection.

No fuzzy, case-insensitive, whitespace-trimming, or similarity-based match is allowed. If zero or multiple targets match, the reference remains unresolved and a warning records its location and reason.

External HTTP references and file references are not fetched or rewritten.

## Structural Recovery

The top-level document must be an object with an `openapi` or `swagger` version, an `info` object, and a `paths` object. Failure of any of these conditions remains fatal.

Within `paths`, recovery is local:

- a non-object path item is skipped;
- unknown path-item keys are ignored;
- a recognized HTTP method whose operation value is not an object is skipped;
- an operation without `responses` receives an empty responses object in compatible mode;
- missing `operationId` remains supported by the existing generated ID;
- duplicate `operationId` values receive stable internal IDs based on `METHOD path`, while the original `operationId` is retained as metadata;
- malformed parameters, request bodies, responses, and schemas remain attached when representable, with unresolved references surfaced by existing formatting behavior.

One damaged operation must not prevent unrelated operations from loading. A path or operation is skipped only when its shape makes extraction impossible.

## Validation Policy

After normalization, validator findings are classified into three groups:

- `repaired`: the source was deterministically normalized;
- `warning`: the issue is local, the document remains traversable, and usable operations can still be extracted;
- `fatal`: parsing failed, required top-level structure is absent, or the normalized document cannot be traversed safely.

Compatible mode returns a context when no fatal finding exists, even if validator warnings remain. Strict mode validates the unmodified input and rejects any finding.

The loader must not treat arbitrary validator messages as compatible solely by matching their text. Compatibility classification must also verify the affected value and document location.

## Diagnostics

`OpenApiContext` gains a structured diagnostics collection while retaining `validationWarnings` for backward compatibility.

Each diagnostic contains:

- severity: `repair`, `warning`, or `skipped`;
- stable code such as `ref_repaired`, `ref_unresolved`, `path_skipped`, or `operation_skipped`;
- JSON Pointer location;
- concise message;
- optional original and replacement values.

CLI startup output summarizes counts by code and prints a bounded sample of locations. It must never write diagnostics to stdout because stdout is reserved for MCP transport.

## Failure and Safety Boundaries

The loader must fail when:

- the source cannot be parsed;
- the root is not an object;
- version, info, or paths is missing or unusable;
- normalization itself encounters an internal invariant failure;
- strict mode observes any validation error.

The loader must not invent schemas, choose among ambiguous targets, fetch external references, delete unknown document fields, or modify the source file.

## Testing

Tests use real loader behavior and cover:

- the observed missing-prefix reference containing an unescaped `/`;
- valid local references remaining unchanged;
- percent-encoded component names;
- ambiguous and missing references remaining unresolved with diagnostics;
- malformed path items and operations being skipped independently;
- missing responses being normalized;
- duplicate operation IDs receiving stable unique internal IDs;
- fatal top-level defects;
- strict mode rejecting documents that compatible mode repairs;
- the supplied `G:\znwd-html\api-docs.json` loading all 194 operations after in-memory normalization, when that fixture is available locally.

The repository test suite, typecheck, and production build are required before completion. GitNexus `detect_changes` must confirm that affected flows are limited to loading, extraction, CLI diagnostics, and their tests.

