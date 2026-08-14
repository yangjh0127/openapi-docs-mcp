import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { loadOpenApi } from "../src/openapi/loader.js";
import { OpenApiService } from "../src/service.js";

const fixturePath = fileURLToPath(new URL("./fixtures/api-docs.json", import.meta.url));
let service: OpenApiService;

beforeAll(async () => {
  service = new OpenApiService(await loadOpenApi(fixturePath));
});

describe("OpenAPI service", () => {
  it("returns an operation with expanded request and response schemas", () => {
    const api = service.getApi({ id: "pageSafetyHazards" }, { maxDepth: 6 });
    const serialized = JSON.stringify(api);

    expect(api).toMatchObject({
      method: "POST",
      path: "/api/hazard/safetyHazard/page",
    });
    expect(serialized).toContain("PageQuery");
    expect(serialized).toContain("HazardPageResponse");
    expect(serialized).toContain("pageNum");
    expect(serialized).toContain("records");
  });

  it("protects schema expansion from circular references", () => {
    const schema = service.getSchema("SafetyHazardVO", { maxDepth: 8 });
    expect(JSON.stringify(schema)).toContain('"circular":true');
  });

  it("lists tag groups and schema names", () => {
    expect(service.listGroups()).toContainEqual({
      name: "异常管理接口",
      operationCount: 1,
    });
    expect(service.listSchemas()).toContain("PageQuery");
  });

  it("keeps the previous context when reloading fails", async () => {
    const context = await loadOpenApi(fixturePath);
    const reloadable = new OpenApiService(context, async () => {
      throw new Error("backend unavailable");
    });

    await expect(reloadable.reload()).rejects.toThrow("backend unavailable");
    expect(reloadable.context).toBe(context);
    expect(reloadable.context.operations).toHaveLength(3);
  });
});

