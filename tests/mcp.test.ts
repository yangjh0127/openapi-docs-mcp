import { fileURLToPath } from "node:url";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMcpServer } from "../src/mcp/server.js";
import { loadOpenApi } from "../src/openapi/loader.js";
import { OpenApiService } from "../src/service.js";

const fixturePath = fileURLToPath(new URL("./fixtures/api-docs.json", import.meta.url));
let client: Client;
let server: ReturnType<typeof createMcpServer>;

beforeEach(async () => {
  const service = new OpenApiService(await loadOpenApi(fixturePath));
  server = createMcpServer(service);
  client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
});

afterEach(async () => {
  await client.close();
  await server.close();
});

describe("MCP server", () => {
  it("advertises exactly the four read-only documentation tools", async () => {
    const result = await client.listTools();

    expect(result.tools.map((tool) => tool.name).sort()).toEqual([
      "get_api",
      "get_schema",
      "list_groups",
      "search_api",
    ]);
    expect(result.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
  });

  it("executes search_api through the MCP protocol", async () => {
    const result = await client.callTool({
      name: "search_api",
      arguments: { query: "任务异常" },
    });

    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result.structuredContent)).toContain("listTaskExceptions");
  });
});

