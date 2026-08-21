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
            "200": {
              content: {
                "application/json": { schema: { $ref: ref } },
              },
            },
          },
        },
      },
    },
    components: { schemas },
  };
}

function responseRef(document: Record<string, any>): string {
  return document.paths["/items"].get.responses["200"]
    .content["application/json"].schema.$ref;
}

describe("normalizeOpenApiDocument references", () => {
  it("repairs a missing component prefix and escapes a slash in the schema name", () => {
    const input = documentWithSchemas(
      { "统一响应«部门使用/人均统计»": { type: "object" } },
      "统一响应«部门使用/人均统计»",
    );

    const result = normalizeOpenApiDocument(input);

    expect(responseRef(result.document)).toBe(
      "#/components/schemas/统一响应«部门使用~1人均统计»",
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "repair",
        code: "ref_repaired",
        original: "统一响应«部门使用/人均统计»",
        replacement: "#/components/schemas/统一响应«部门使用~1人均统计»",
      }),
    );
    expect(responseRef(input)).toBe("统一响应«部门使用/人均统计»");
  });

  it("leaves valid local and external references unchanged", () => {
    const local = documentWithSchemas(
      { User: { type: "object" } },
      "#/components/schemas/User",
    );
    const external = documentWithSchemas(
      {},
      "https://example.com/openapi.json#/User",
    );

    expect(normalizeOpenApiDocument(local).diagnostics).toEqual([]);
    expect(normalizeOpenApiDocument(external).diagnostics).toEqual([]);
  });

  it("repairs a once-percent-encoded exact component name", () => {
    const input = documentWithSchemas(
      { 用户信息: { type: "object" } },
      "%E7%94%A8%E6%88%B7%E4%BF%A1%E6%81%AF",
    );

    expect(responseRef(normalizeOpenApiDocument(input).document)).toBe(
      "#/components/schemas/用户信息",
    );
  });

  it("does not guess when a name exists in multiple component collections", () => {
    const input = documentWithSchemas({ Shared: { type: "object" } }, "Shared");
    input.components.responses = { Shared: { description: "OK" } };

    const result = normalizeOpenApiDocument(input);

    expect(responseRef(result.document)).toBe("Shared");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "ref_ambiguous",
      }),
    );
  });

  it("reports an unresolved reference without inventing a target", () => {
    const result = normalizeOpenApiDocument(documentWithSchemas({}, "Missing"));

    expect(responseRef(result.document)).toBe("Missing");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "ref_unresolved",
      }),
    );
  });
});

describe("normalizeOpenApiDocument structure", () => {
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
    const output = result.document as Record<string, any>;

    expect(output.paths).toEqual({
      "/bad-operation": {},
      "/recoverable": { get: { summary: "works", responses: {} } },
    });
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "path_skipped",
        "operation_skipped",
        "responses_added",
      ]),
    );
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
    const output = result.document as Record<string, any>;

    expect(output.paths["/a"].get.operationId).toBe("duplicate");
    expect(
      result.diagnostics.filter((item) => item.code === "duplicate_operation_id"),
    ).toHaveLength(2);
  });
});
