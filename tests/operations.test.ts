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

    expect(operations.map((item) => item.id)).toEqual([
      "GET /a",
      "POST /b",
      "unique",
    ]);
    expect(operations.slice(0, 2).map((item) => item.operationId)).toEqual([
      "same",
      "same",
    ]);
  });
});
