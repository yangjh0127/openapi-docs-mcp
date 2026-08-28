import { describe, expect, it } from "vitest";
import type { OpenAPI } from "@scalar/openapi-types";
import { formatOperation } from "../src/formatter/operation.js";
import { formatSchema } from "../src/formatter/schema.js";
import type { JsonObject, OperationEntry } from "../src/types.js";

describe("OpenAPI reference formatting", () => {
  it("marks circular parameter references instead of overflowing the stack", () => {
    const document = {
      openapi: "3.0.3",
      info: { title: "Circular parameters", version: "1.0.0" },
      paths: {
        "/items": {
          get: {
            parameters: [{ $ref: "#/components/parameters/A" }],
            responses: {},
          },
        },
      },
      components: {
        parameters: {
          A: { $ref: "#/components/parameters/B" },
          B: { $ref: "#/components/parameters/A" },
        },
      },
    } satisfies OpenAPI.Document;
    const pathItem = document.paths["/items"];
    const entry: OperationEntry = {
      id: "GET /items",
      method: "get",
      path: "/items",
      tags: [],
      operation: pathItem.get as unknown as JsonObject,
      pathItem: pathItem as unknown as JsonObject,
    };

    const result = formatOperation(document, entry);

    expect(result.parameters).toEqual([
      {
        $ref: "#/components/parameters/A",
        name: "A",
        parameter: {
          $ref: "#/components/parameters/B",
          name: "B",
          parameter: {
            $ref: "#/components/parameters/A",
            name: "A",
            circular: true,
          },
        },
      },
    ]);
  });

  it("marks circular request-body references instead of overflowing the stack", () => {
    const document = {
      openapi: "3.0.3",
      info: { title: "Circular request bodies", version: "1.0.0" },
      paths: {
        "/items": {
          post: {
            requestBody: { $ref: "#/components/requestBodies/A" },
            responses: {},
          },
        },
      },
      components: {
        requestBodies: {
          A: { $ref: "#/components/requestBodies/B" },
          B: { $ref: "#/components/requestBodies/A" },
        },
      },
    } satisfies OpenAPI.Document;
    const pathItem = document.paths["/items"];
    const entry: OperationEntry = {
      id: "POST /items",
      method: "post",
      path: "/items",
      tags: [],
      operation: pathItem.post as unknown as JsonObject,
      pathItem: pathItem as unknown as JsonObject,
    };

    const result = formatOperation(document, entry);

    expect(JSON.stringify(result.requestBody)).toContain('"circular":true');
  });

  it("marks circular response references instead of overflowing the stack", () => {
    const document = {
      openapi: "3.0.3",
      info: { title: "Circular responses", version: "1.0.0" },
      paths: {
        "/items": {
          get: {
            responses: { "200": { $ref: "#/components/responses/A" } },
          },
        },
      },
      components: {
        responses: {
          A: { $ref: "#/components/responses/B" },
          B: { $ref: "#/components/responses/A" },
        },
      },
    } satisfies OpenAPI.Document;
    const pathItem = document.paths["/items"];
    const entry: OperationEntry = {
      id: "GET /items",
      method: "get",
      path: "/items",
      tags: [],
      operation: pathItem.get as unknown as JsonObject,
      pathItem: pathItem as unknown as JsonObject,
    };

    const result = formatOperation(document, entry);

    expect(JSON.stringify(result.responses)).toContain('"circular":true');
  });

  it("bounds non-schema reference expansion by maxDepth", () => {
    const document = {
      openapi: "3.0.3",
      info: { title: "Deep parameters", version: "1.0.0" },
      paths: {
        "/items": {
          get: {
            parameters: [{ $ref: "#/components/parameters/A" }],
            responses: {},
          },
        },
      },
      components: {
        parameters: {
          A: { $ref: "#/components/parameters/B" },
          B: { name: "limit", in: "query" },
        },
      },
    } satisfies OpenAPI.Document;
    const pathItem = document.paths["/items"];
    const entry: OperationEntry = {
      id: "GET /items",
      method: "get",
      path: "/items",
      tags: [],
      operation: pathItem.get as JsonObject,
      pathItem: pathItem as JsonObject,
    };

    const result = formatOperation(document, entry, { maxDepth: 1 });

    expect(JSON.stringify(result.parameters)).toContain(
      '"truncated":"maxDepth"',
    );
  });

  it("resolves percent-encoded local schema references", () => {
    const document = {
      openapi: "3.0.3",
      info: { title: "Encoded references", version: "1.0.0" },
      paths: {},
      components: { schemas: { 用户: { type: "object" } } },
    } satisfies OpenAPI.Document;

    expect(
      formatSchema(document, {
        $ref: "#/components/schemas/%E7%94%A8%E6%88%B7",
      }),
    ).toEqual({
      $ref: "#/components/schemas/%E7%94%A8%E6%88%B7",
      name: "用户",
      schema: { type: "object" },
    });
  });

  it("preserves malformed percent escapes without throwing", () => {
    const document = {
      openapi: "3.0.3",
      info: { title: "Malformed references", version: "1.0.0" },
      paths: {},
      components: { schemas: {} },
    } satisfies OpenAPI.Document;

    expect(
      formatSchema(document, { $ref: "#/components/schemas/%ZZ" }),
    ).toEqual({
      $ref: "#/components/schemas/%ZZ",
      name: "%ZZ",
      unresolved: true,
    });
  });
});
