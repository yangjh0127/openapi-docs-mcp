import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { loadOpenApi } from "../src/openapi/loader.js";
import { searchOperations } from "../src/search/search.js";
import type { OpenApiContext } from "../src/types.js";
import type { OperationEntry } from "../src/types.js";

const fixturePath = fileURLToPath(new URL("./fixtures/api-docs.json", import.meta.url));
let context: OpenApiContext;

beforeAll(async () => {
  context = await loadOpenApi(fixturePath);
});

describe("weighted operation search", () => {
  it("matches Chinese text without relying on whitespace tokenization", () => {
    const results = searchOperations(context.operations, {
      query: "任务异常清单",
    });

    expect(results[0]?.id).toBe("listTaskExceptions");
    expect(results[0]?.matchedFields).toContain("summary");
  });

  it("combines tag intent with a generic summary and preserves close candidates", () => {
    const results = searchOperations(context.operations, {
      query: "异常分页列表",
    });

    const hazardPage = results.find((result) => result.id === "pageSafetyHazards");
    expect(hazardPage?.matchedFields).toEqual(expect.arrayContaining(["summary", "tags"]));
    expect(results.map((result) => result.id)).toContain("listTaskExceptions");
  });

  it("supports deterministic method and tag filters", () => {
    const results = searchOperations(context.operations, {
      query: "",
      method: "POST",
      tag: "异常管理接口",
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.method).toBe("POST");
  });

  it("prioritizes full query coverage over duplicate partial matches", () => {
    const operations: OperationEntry[] = [
      {
        id: "downloadOfficerTemplate",
        method: "get",
        path: "/officers/download",
        summary: "下载安全员导入模板",
        description: "下载安全员导入模板",
        tags: ["安全员管理接口"],
        operation: {},
        pathItem: {},
      },
      {
        id: "pageOfficers",
        method: "post",
        path: "/officers/page",
        summary: "分页查询",
        tags: ["安全员管理接口"],
        operation: {},
        pathItem: {},
      },
    ];

    const results = searchOperations(operations, { query: "安全员分页" });
    expect(results[0]?.id).toBe("pageOfficers");
    expect(results[0]?.queryCoverage).toBeGreaterThan(results[1]?.queryCoverage ?? 0);
  });
});
