import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMcpServer } from "../src/mcp/server.js";
import { loadOpenApi } from "../src/openapi/loader.js";
import { OpenApiService } from "../src/service.js";

const fixturePath = fileURLToPath(new URL("./fixtures/api-docs.json", import.meta.url));
const packageVersion = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;
let client: Client;
let server: ReturnType<typeof createMcpServer>;

beforeEach(async () => {
  const reload = () => loadOpenApi(fixturePath);
  const service = new OpenApiService(await reload(), reload);
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
  it("reports the package version during initialization", () => {
    expect(client.getServerVersion()?.version).toBe(packageVersion);
  });

  it("advertises four read-only tools and one reload tool", async () => {
    const result = await client.listTools();

    expect(result.tools.map((tool) => tool.name).sort()).toEqual([
      "get_api",
      "get_schema",
      "list_groups",
      "reload_document",
      "search_api",
    ]);
    expect(
      result.tools
        .filter((tool) => tool.name !== "reload_document")
        .every((tool) => tool.annotations?.readOnlyHint === true),
    ).toBe(true);
    expect(
      result.tools.find((tool) => tool.name === "reload_document")?.annotations,
    ).toMatchObject({ readOnlyHint: false, destructiveHint: false });
  });

  it("advertises an evidence-first API discovery workflow", async () => {
    const { tools } = await client.listTools();
    const search = tools.find((tool) => tool.name === "search_api");
    const getApi = tools.find((tool) => tool.name === "get_api");
    const listGroups = tools.find((tool) => tool.name === "list_groups");
    const queryDescription = (
      search?.inputSchema.properties as
        | Record<string, { description?: string }>
        | undefined
    )?.query?.description;
    const tagDescription = (
      search?.inputSchema.properties as
        | Record<string, { description?: string }>
        | undefined
    )?.tag?.description;

    expect(search?.description).toMatch(/preserve exact identifiers/i);
    expect(search?.description).toMatch(/multiple short query variants/i);
    expect(queryDescription).toMatch(/1–4.*entity.*action/i);
    expect(queryDescription).toMatch(/not the full user sentence/i);
    expect(tagDescription).toMatch(/case-insensitive full tag/i);
    expect(getApi?.description).toMatch(/call directly/i);
    expect(getApi?.description).toMatch(/never silently replace/i);
    expect(getApi?.description).toMatch(/path without a method.*search_api first/i);
    expect(listGroups?.description).toMatch(/terminology is unclear/i);
  });

  it("executes search_api through the MCP protocol", async () => {
    const result = await client.callTool({
      name: "search_api",
      arguments: { query: "任务异常" },
    });

    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result.structuredContent)).toContain("listTaskExceptions");
  });

  it("reloads the configured document through the MCP protocol", async () => {
    const result = await client.callTool({
      name: "reload_document",
      arguments: {},
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      previousOperationCount: 3,
      operationCount: 3,
    });
  });
});
