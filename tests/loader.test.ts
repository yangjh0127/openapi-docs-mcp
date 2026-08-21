import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createOpenApiContext, loadOpenApi } from "../src/openapi/loader.js";

const fixturePath = fileURLToPath(new URL("./fixtures/api-docs.json", import.meta.url));

describe("OpenAPI loader", () => {
  it("loads, validates, and indexes a local document", async () => {
    const context = await loadOpenApi(fixturePath);

    expect(context.version).toBe("3.0");
    expect(context.operations).toHaveLength(3);
    expect(context.operations.map((entry) => entry.id)).toContain("pageSafetyHazards");
    expect(context.diagnostics).toEqual([]);
  });

  it("rejects an invalid document with useful validation details", async () => {
    await expect(
      createOpenApiContext({ openapi: "3.0.3", paths: {} }),
    ).rejects.toThrow(/Invalid OpenAPI document/);
  });

  it("accepts YAML input", async () => {
    const context = await createOpenApiContext(`
openapi: 3.1.0
info:
  title: YAML API
  version: 1.0.0
paths:
  /health:
    get:
      summary: Health check
      responses:
        "200":
          description: OK
`);

    expect(context.operations[0]).toMatchObject({
      method: "get",
      path: "/health",
    });
  });

  it("indexes Swagger 2.0 documents without converting the core model", async () => {
    const context = await createOpenApiContext({
      swagger: "2.0",
      info: { title: "Legacy API", version: "1.0.0" },
      paths: {
        "/legacy": {
          get: {
            operationId: "getLegacy",
            responses: { "200": { description: "OK" } },
          },
        },
      },
    });

    expect(context.version).toBe("2.0");
    expect(context.operations[0]?.id).toBe("getLegacy");
  });

  it("accepts resolvable Unicode local references in compatible mode", async () => {
    const document = {
      openapi: "3.0.3",
      info: { title: "Chinese schemas", version: "1.0.0" },
      paths: {
        "/items": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/分页请求«检查项 Query»" },
                },
              },
            },
            responses: { "200": { description: "OK" } },
          },
        },
      },
      components: {
        schemas: {
          "分页请求«检查项 Query»": { type: "object" },
        },
      },
    };

    const context = await createOpenApiContext(document);
    expect(context.operations).toHaveLength(1);
    expect(context.validationWarnings.length).toBeGreaterThan(0);
    await expect(
      createOpenApiContext(document, "memory", { validationMode: "strict" }),
    ).rejects.toThrow(/Invalid OpenAPI document/);
  });

  it("repairs the observed malformed response reference in compatible mode", async () => {
    const document = {
      openapi: "3.0.3",
      info: { title: "API", version: "1" },
      paths: {
        "/stats": {
          post: {
            responses: {
              "200": {
                content: {
                  "*/*": {
                    schema: { $ref: "统一响应«部门使用/人均统计»" },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          "统一响应«部门使用/人均统计»": { type: "object" },
        },
      },
    };

    const context = await createOpenApiContext(document);

    expect(context.operations).toHaveLength(1);
    expect(context.diagnostics).toContainEqual(
      expect.objectContaining({ code: "ref_repaired" }),
    );
    expect(
      document.paths["/stats"].post.responses["200"].content["*/*"].schema.$ref,
    ).toBe("统一响应«部门使用/人均统计»");
    await expect(
      createOpenApiContext(document, "memory", { validationMode: "strict" }),
    ).rejects.toThrow(/Invalid OpenAPI document/);
  });

  it("loads usable operations while skipping locally malformed entries", async () => {
    const context = await createOpenApiContext({
      openapi: "3.0.3",
      info: { title: "API", version: "1" },
      paths: {
        "/broken": { post: [] },
        "/usable": {
          get: { responses: { "200": { description: "OK" } } },
        },
      },
    });

    expect(context.operations.map((item) => item.path)).toEqual(["/usable"]);
    expect(context.diagnostics).toContainEqual(
      expect.objectContaining({ code: "operation_skipped" }),
    );
  });

  it.each([
    null,
    [],
    { openapi: "3.0.3", info: {}, paths: null },
  ])("rejects unusable top-level input %#", async (input) => {
    await expect(createOpenApiContext(input as never)).rejects.toThrow(
      /Invalid OpenAPI document/,
    );
  });
});
