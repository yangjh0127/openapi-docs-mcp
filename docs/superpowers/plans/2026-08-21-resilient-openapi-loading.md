# Resilient OpenAPI Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start the MCP server with every safely recoverable operation from imperfect OpenAPI documents while preserving strict validation and emitting explicit repair/skip diagnostics.

**Architecture:** Add a pure normalization module between parser output and final validation. It clones the parsed document, performs only deterministic repairs, and emits structured diagnostics; the loader owns strict-versus-compatible policy, operation extraction owns stable IDs, and the CLI only summarizes diagnostics to stderr.

**Tech Stack:** TypeScript 7, Node.js 20+, `@scalar/openapi-parser`, Vitest 4, GitNexus

**Spec:** `docs/superpowers/specs/2026-08-21-resilient-openapi-loading-design.md`

## Global Constraints

- Compatible mode is the default; strict mode validates the unmodified input and rejects every validation finding.
- Repairs must be deterministic and must never use fuzzy, case-insensitive, or whitespace-trimmed matching.
- The caller's input object and source file must never be mutated.
- External references must not be fetched or rewritten.
- Diagnostics go to stderr only; stdout remains reserved for MCP transport.
- Existing `validationWarnings` remains available for backward compatibility.

---

### Task 1: Pure document normalizer and diagnostics model

**Files:**
- Create: `src/openapi/normalize.ts`
- Create: `tests/normalize.test.ts`
- Modify: `src/types.ts`

**Interfaces:**
- Consumes: `JsonObject` from `src/types.ts`.
- Produces: `OpenApiDiagnostic`, `DiagnosticCode`, and `normalizeOpenApiDocument(document: JsonObject): { document: JsonObject; diagnostics: OpenApiDiagnostic[] }`.
- Guarantee: returned `document` is a deep clone and input is unchanged.

- [ ] **Step 1: Add the failing tests for deterministic `$ref` repair**

Create `tests/normalize.test.ts` with real input documents and assertions equivalent to:

```ts
import { describe, expect, it } from "vitest";
import { normalizeOpenApiDocument } from "../src/openapi/normalize.js";

function documentWithSchemas(
  schemas: Record<string, unknown>,
  ref: string,
): Record<string, any> {
  return {
    openapi: "3.0.3",
    info: { title: "API", version: "1" },
    paths: {
      "/items": {
        get: {
          responses: {
            "200": { content: { "application/json": { schema: { $ref: ref } } } },
          },
        },
      },
    },
    components: { schemas },
  };
}

describe("normalizeOpenApiDocument", () => {
  it("repairs a missing component prefix and escapes a slash in the schema name", () => {
    const input = documentWithSchemas(
      { "统一响应«部门使用/人均统计»": { type: "object" } },
      "统一响应«部门使用/人均统计»",
    );

    const result = normalizeOpenApiDocument(input);
    const output = result.document as any;

    expect(output.paths["/items"].get.responses["200"]
      .content["application/json"].schema.$ref)
      .toBe("#/components/schemas/统一响应«部门使用~1人均统计»");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      severity: "repair",
      code: "ref_repaired",
      original: "统一响应«部门使用/人均统计»",
      replacement: "#/components/schemas/统一响应«部门使用~1人均统计»",
    }));
    expect(input.paths["/items"].get.responses["200"]
      .content["application/json"].schema.$ref)
      .toBe("统一响应«部门使用/人均统计»");
  });

  it("leaves valid local and external references unchanged", () => {
    const local = documentWithSchemas({ User: { type: "object" } }, "#/components/schemas/User");
    const external = documentWithSchemas({}, "https://example.com/openapi.json#/User");
    expect(normalizeOpenApiDocument(local).diagnostics).toEqual([]);
    expect(normalizeOpenApiDocument(external).diagnostics).toEqual([]);
  });

  it("repairs a once-percent-encoded exact component name", () => {
    const input = documentWithSchemas({ "用户信息": { type: "object" } }, "%E7%94%A8%E6%88%B7%E4%BF%A1%E6%81%AF");
    const output = normalizeOpenApiDocument(input).document as any;
    expect(output.paths["/items"].get
      .responses["200"].content["application/json"].schema.$ref)
      .toBe("#/components/schemas/用户信息");
  });

  it("does not guess when a name exists in multiple component collections", () => {
    const input = documentWithSchemas({ Shared: { type: "object" } }, "Shared");
    input.components.responses = { Shared: { description: "OK" } };
    const result = normalizeOpenApiDocument(input);
    const output = result.document as any;
    expect(output.paths["/items"].get.responses["200"]
      .content["application/json"].schema.$ref).toBe("Shared");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      severity: "warning",
      code: "ref_ambiguous",
    }));
  });

  it("reports an unresolved reference without inventing a target", () => {
    const result = normalizeOpenApiDocument(documentWithSchemas({}, "Missing"));
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      severity: "warning",
      code: "ref_unresolved",
    }));
  });
});
```

- [ ] **Step 2: Run the normalizer tests and verify RED**

Run: `pnpm exec vitest run tests/normalize.test.ts`

Expected: FAIL because `src/openapi/normalize.ts` and its exported function do not exist.

- [ ] **Step 3: Add diagnostic types and the minimal pure normalizer**

Add to `src/types.ts`:

```ts
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
```

Implement `normalizeOpenApiDocument` in `src/openapi/normalize.ts` as a pure recursive walk:

```ts
import type { DiagnosticCode, JsonObject, OpenApiDiagnostic } from "../types.js";
import { HTTP_METHODS, asObject } from "./operations.js";

export interface NormalizeResult {
  document: JsonObject;
  diagnostics: OpenApiDiagnostic[];
}

export function normalizeOpenApiDocument(input: JsonObject): NormalizeResult {
  const document = structuredClone(input);
  const diagnostics: OpenApiDiagnostic[] = [];
  const targets = collectReferenceTargets(document);
  walkAndRepairReferences(document, "", targets, diagnostics);
  normalizePaths(document, diagnostics);
  reportDuplicateOperationIds(document, diagnostics);
  return { document, diagnostics };
}
```

Use RFC 6901 helpers with exact behavior:

```ts
function encodePointerSegment(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function decodeOnce(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}
```

Collect exact candidates from `components.schemas`, `components.parameters`, `components.responses`, `components.requestBodies`, and `definitions`. A malformed reference is replaced only when candidate count is exactly one. Valid resolved `#/...` and non-local references are unchanged. Zero and multiple matches emit `ref_unresolved` and `ref_ambiguous` respectively.

- [ ] **Step 4: Add failing structural-recovery tests**

Extend `tests/normalize.test.ts`:

```ts
it("skips malformed paths and operations and adds missing responses", () => {
  const input = {
    openapi: "3.0.3",
    info: { title: "API", version: "1" },
    paths: {
      "/bad-path": "not an object",
      "/bad-operation": { post: [] },
      "/recoverable": { get: { summary: "works" } },
    },
  };
  const result = normalizeOpenApiDocument(input);
  const output = result.document as any;
  expect(output.paths).toEqual({
    "/bad-operation": {},
    "/recoverable": { get: { summary: "works", responses: {} } },
  });
  expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
    "path_skipped", "operation_skipped", "responses_added",
  ]));
});

it("reports duplicate operation IDs without changing their metadata", () => {
  const input = {
    openapi: "3.0.3",
    info: { title: "API", version: "1" },
    paths: {
      "/a": { get: { operationId: "duplicate", responses: {} } },
      "/b": { post: { operationId: "duplicate", responses: {} } },
    },
  };
  const result = normalizeOpenApiDocument(input);
  const output = result.document as any;
  expect(output.paths["/a"].get.operationId).toBe("duplicate");
  expect(result.diagnostics.filter((item) => item.code === "duplicate_operation_id")).toHaveLength(2);
});
```

- [ ] **Step 5: Run the test, implement minimal structural normalization, and verify GREEN**

Run before implementation: `pnpm exec vitest run tests/normalize.test.ts`

Expected: FAIL on the new structural assertions.

Implement `normalizePaths` and `reportDuplicateOperationIds` using only `HTTP_METHODS`, object shape checks, and stable JSON Pointer paths. Then run:

`pnpm exec vitest run tests/normalize.test.ts`

Expected: all normalizer tests PASS.

- [ ] **Step 6: Commit Task 1**

Before committing, run `mcp__gitnexus__detect_changes` with `scope: "all"`, review affected flows, then:

```bash
git add src/types.ts src/openapi/normalize.ts tests/normalize.test.ts
git commit -m "feat: normalize recoverable OpenAPI defects"
```

---

### Task 2: Loader policy and stable operation extraction

**Files:**
- Modify: `src/openapi/loader.ts`
- Modify: `src/openapi/operations.ts`
- Modify: `src/types.ts`
- Modify: `tests/loader.test.ts`
- Create: `tests/operations.test.ts`

**Interfaces:**
- Consumes: `normalizeOpenApiDocument` and `OpenApiDiagnostic` from Task 1.
- Produces: `OpenApiContext.diagnostics: OpenApiDiagnostic[]` and unique `OperationEntry.id` values.
- Preserves: `loadOpenApi`, `createOpenApiContext`, and `extractOperations` public call signatures.

- [ ] **Step 1: Write the failing compatible-versus-strict loader tests**

Add to `tests/loader.test.ts`:

```ts
it("repairs the observed malformed response reference in compatible mode", async () => {
  const document = {
    openapi: "3.0.3",
    info: { title: "API", version: "1" },
    paths: {
      "/stats": {
        post: {
          responses: {
            "200": { content: { "*/*": { schema: {
              $ref: "统一响应«部门使用/人均统计»",
            } } } },
          },
        },
      },
    },
    components: { schemas: { "统一响应«部门使用/人均统计»": { type: "object" } } },
  };

  const context = await createOpenApiContext(document);
  expect(context.operations).toHaveLength(1);
  expect(context.diagnostics).toContainEqual(expect.objectContaining({ code: "ref_repaired" }));
  expect(document.paths["/stats"].post.responses["200"].content["*/*"].schema.$ref)
    .toBe("统一响应«部门使用/人均统计»");
  await expect(createOpenApiContext(document, "memory", { validationMode: "strict" }))
    .rejects.toThrow(/Invalid OpenAPI document/);
});

it("loads usable operations while skipping locally malformed entries", async () => {
  const context = await createOpenApiContext({
    openapi: "3.0.3",
    info: { title: "API", version: "1" },
    paths: {
      "/broken": { post: [] },
      "/usable": { get: { responses: { "200": { description: "OK" } } } },
    },
  });
  expect(context.operations.map((item) => item.path)).toEqual(["/usable"]);
  expect(context.diagnostics).toContainEqual(expect.objectContaining({ code: "operation_skipped" }));
});

it.each([
  null,
  [],
  { openapi: "3.0.3", info: {}, paths: null },
])("rejects unusable top-level input %#", async (input) => {
  await expect(createOpenApiContext(input as never)).rejects.toThrow(/Invalid OpenAPI document/);
});
```

- [ ] **Step 2: Run loader tests and verify RED**

Run: `pnpm exec vitest run tests/loader.test.ts`

Expected: FAIL because compatible mode does not normalize the malformed reference and `OpenApiContext` has no `diagnostics` field.

- [ ] **Step 3: Integrate normalization into `createOpenApiContext`**

Refactor the loader into these exact policy branches (where `ValidationResult` is `Awaited<ReturnType<typeof validate>>`):

```ts
export async function createOpenApiContext(
  input: string | JsonObject,
  source = "memory",
  options: Pick<LoadOpenApiOptions, "validationMode"> = {},
): Promise<OpenApiContext> {
  const initial = await validate(input);
  if (options.validationMode === "strict") {
    if (!initial.valid || !initial.specification) {
      throw new Error(`Invalid OpenAPI document: ${formatValidationErrors(initial.errors)}`);
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
  if (!initial.specification) {
    throw new Error(`Invalid OpenAPI document: ${formatValidationErrors(initial.errors)}`);
  }

  const parsed = initial.specification as unknown as JsonObject;
  assertDocumentShape(parsed);
  const normalized = normalizeOpenApiDocument(parsed);
  const result = await validate(normalized.document);
  const fatalErrors = result.errors.filter((error) => isFatalValidationError(error));
  if (!result.specification || fatalErrors.length > 0) {
    throw new Error(`Invalid OpenAPI document: ${formatValidationErrors(result.errors)}`);
  }

  const document = result.specification as OpenAPI.Document;
  return {
    document,
    source,
    version: result.version ?? getDocumentVersion(document),
    operations: extractOperations(document),
    validationWarnings: summarizeWarnings(result.errors),
    diagnostics: [
      ...normalized.diagnostics,
      ...result.errors.map(toValidationDiagnostic),
    ],
  };
}
```

Define the classifier and diagnostic conversion with these signatures:

```ts
type ValidationError = { message: string; path?: string[] | string };

function isFatalValidationError(error: ValidationError): boolean {
  const path = Array.isArray(error.path) ? `/${error.path.join("/")}` : error.path ?? "";
  return path === "" || path === "/openapi" || path === "/swagger" ||
    path === "/info" || path === "/paths";
}

function toValidationDiagnostic(error: ValidationError): OpenApiDiagnostic {
  return {
    severity: "warning",
    code: "validation_warning",
    path: Array.isArray(error.path) ? `/${error.path.join("/")}` : error.path ?? "",
    message: error.message,
  };
}
```

`assertDocumentShape` remains the final defensive gate. Wrap parser exceptions so invalid JSON/YAML is rethrown with the `Invalid OpenAPI document:` prefix. Strict mode returns no repairs and rejects when `result.valid` is false.

Add `diagnostics: OpenApiDiagnostic[]` to `OpenApiContext` and populate `[]` for clean and strict-valid documents.

- [ ] **Step 4: Run loader tests and verify GREEN**

Run: `pnpm exec vitest run tests/loader.test.ts`

Expected: all loader tests PASS, including existing YAML, Swagger 2.0, and Unicode-reference cases.

- [ ] **Step 5: Write a failing test for duplicate operation IDs**

Create `tests/operations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractOperations } from "../src/openapi/operations.js";

describe("extractOperations", () => {
  it("uses stable method-path IDs when operationId is duplicated", () => {
    const operations = extractOperations({
      openapi: "3.0.3",
      info: { title: "API", version: "1" },
      paths: {
        "/a": { get: { operationId: "same", responses: {} } },
        "/b": { post: { operationId: "same", responses: {} } },
        "/c": { get: { operationId: "unique", responses: {} } },
      },
    });
    expect(operations.map((item) => item.id)).toEqual(["GET /a", "POST /b", "unique"]);
    expect(operations.slice(0, 2).map((item) => item.operationId)).toEqual(["same", "same"]);
  });
});
```

- [ ] **Step 6: Run operations test, implement unique IDs, and verify GREEN**

Run before implementation: `pnpm exec vitest run tests/operations.test.ts`

Expected: FAIL because both duplicate entries currently use `same`.

Implement a first pass that counts non-empty operation IDs, then assign `operationId` only when its count is one; otherwise assign `${method.toUpperCase()} ${path}`. Preserve `entry.operationId` metadata. Run:

`pnpm exec vitest run tests/operations.test.ts tests/loader.test.ts`

Expected: both files PASS.

- [ ] **Step 7: Commit Task 2**

Run GitNexus `detect_changes({ scope: "all" })`, confirm loading/extraction flows only, then:

```bash
git add src/types.ts src/openapi/loader.ts src/openapi/operations.ts tests/loader.test.ts tests/operations.test.ts
git commit -m "feat: load usable operations from imperfect specs"
```

---

### Task 3: CLI diagnostics, real-document regression, and full verification

**Files:**
- Create: `src/openapi/diagnostics.ts`
- Create: `tests/diagnostics.test.ts`
- Modify: `src/cli.ts`
- Modify: `tests/loader.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `OpenApiContext.diagnostics` from Task 2.
- Produces: `formatDiagnosticSummary(diagnostics: OpenApiDiagnostic[], sampleLimit?: number): string[]` and bounded stderr summaries grouped by stable diagnostic code.
- Preserves: MCP stdout transport and all CLI arguments.

- [ ] **Step 1: Write a failing test for a bounded diagnostic summary helper**

Create `tests/diagnostics.test.ts` against the wished-for `formatDiagnosticSummary` export, with three repeated diagnostics plus one different code:

```ts
import { expect, it } from "vitest";
import { formatDiagnosticSummary } from "../src/openapi/diagnostics.js";

it("groups diagnostics and bounds example locations", () => {
  expect(formatDiagnosticSummary([
    { severity: "repair", code: "ref_repaired", path: "/a", message: "fixed" },
    { severity: "repair", code: "ref_repaired", path: "/b", message: "fixed" },
    { severity: "repair", code: "ref_repaired", path: "/c", message: "fixed" },
    { severity: "skipped", code: "operation_skipped", path: "/d", message: "skipped" },
  ], 2)).toEqual([
    "OpenAPI diagnostic ref_repaired (3); examples: /a, /b",
    "OpenAPI diagnostic operation_skipped (1); examples: /d",
  ]);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm exec vitest run tests/diagnostics.test.ts`

Expected: FAIL because `src/openapi/diagnostics.ts` does not exist.

- [ ] **Step 3: Implement and wire CLI diagnostic output**

Implement the pure formatter with this contract:

```ts
export function formatDiagnosticSummary(
  diagnostics: OpenApiDiagnostic[],
  sampleLimit = 5,
): string[]
```

It groups by `code`, preserves first-seen code order, counts all items, clamps `sampleLimit` to a non-negative integer, and includes no more than that many locations per code. Import it into `src/cli.ts`. In `main`, replace the old warning-only loop with:

```ts
for (const line of formatDiagnosticSummary(context.diagnostics)) {
  console.error(line);
}
```

Keep the existing `Loaded ...` line and never call `console.log`.

- [ ] **Step 4: Add and run the supplied-document regression**

Add a Windows-local optional regression in `tests/loader.test.ts`:

```ts
import { existsSync } from "node:fs";

const suppliedDocument = "G:\\znwd-html\\api-docs.json";

it.skipIf(!existsSync(suppliedDocument))(
  "loads the supplied imperfect backend document",
  async () => {
    const context = await loadOpenApi(suppliedDocument);
    expect(context.operations).toHaveLength(194);
    expect(context.diagnostics).toContainEqual(expect.objectContaining({
      code: "ref_repaired",
      original: "统一API响应结果«分页对象«分部门使用/人均使用统计表 VO»»",
    }));
  },
);
```

Run: `pnpm exec vitest run tests/loader.test.ts`

Expected: PASS and confirm 194 operations when the supplied file exists.

- [ ] **Step 5: Document compatibility behavior**

Update `README.md` validation documentation with:

```md
### Compatibility diagnostics

Compatible mode repairs only unambiguous local references, skips malformed path or operation entries, and reports every repair or skip on stderr. Unresolved or ambiguous references are retained and reported; external references are never fetched. Use `--strict-validation` to disable repairs and reject every validation finding.
```

- [ ] **Step 6: Run complete verification**

Run all commands fresh:

```bash
pnpm test
pnpm typecheck
pnpm build
node dist/cli.js --source G:\znwd-html\api-docs.json
```

For the final CLI command, verify stderr reports 194 loaded operations and diagnostics before terminating the waiting stdio server. If stdin closes automatically, exit code 0 is acceptable.

- [ ] **Step 7: Inspect final scope and commit**

Run:

- `git diff --check`
- `git status --short`
- GitNexus `detect_changes({ scope: "all" })`

Confirm no user-owned changes to `AGENTS.md` or `CLAUDE.md` are staged. Then:

```bash
git add src/openapi/diagnostics.ts tests/diagnostics.test.ts src/cli.ts tests/loader.test.ts README.md
git commit -m "docs: report OpenAPI compatibility diagnostics"
```
