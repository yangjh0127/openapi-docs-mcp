import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { OpenApiService } from "../service.js";
import type { JsonObject } from "../types.js";

const depthSchema = z.number().int().min(1).max(12).default(5);

export function createMcpServer(service: OpenApiService): McpServer {
  const server = new McpServer({
    name: "openapi-docs-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "search_api",
    {
      title: "Search OpenAPI operations",
      description:
        "Search API operations by natural-language keywords, path, tag, description, or operationId. Returns ranked lightweight candidates; call get_api for full details.",
      inputSchema: z.object({
        query: z.string().default("").describe("Keywords such as 异常分页列表 or create user"),
        method: z.string().optional().describe("Optional HTTP method filter"),
        tag: z.string().optional().describe("Optional exact tag filter"),
        limit: z.number().int().min(1).max(50).default(10),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ query, method, tag, limit }) =>
      success({
        results: service.search({
          query,
          limit,
          ...(method !== undefined ? { method } : {}),
          ...(tag !== undefined ? { tag } : {}),
        }),
        totalOperations: service.context.operations.length,
      }),
  );

  server.registerTool(
    "get_api",
    {
      title: "Get one OpenAPI operation",
      description:
        "Get the request parameters, expanded request body, responses, tags, and metadata for one operation. Prefer the id returned by search_api.",
      inputSchema: z
        .object({
          id: z.string().optional().describe("Stable id returned by search_api"),
          path: z.string().optional().describe("Exact OpenAPI path"),
          method: z.string().optional().describe("HTTP method used with path"),
          maxDepth: depthSchema,
        })
        .refine((value) => Boolean(value.id || value.path), {
          message: "Provide id or path",
        }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ id, path, method, maxDepth }) => {
      const api = service.getApi(
        {
          ...(id !== undefined ? { id } : {}),
          ...(path !== undefined ? { path } : {}),
          ...(method !== undefined ? { method } : {}),
        },
        { maxDepth },
      );
      return api
        ? success(api)
        : failure("Operation not found. Use search_api to obtain a valid id.");
    },
  );

  server.registerTool(
    "get_schema",
    {
      title: "Get one OpenAPI schema",
      description:
        "Get a named component schema with bounded local $ref expansion and circular-reference protection.",
      inputSchema: z.object({
        name: z.string().min(1).describe("Exact component schema name"),
        maxDepth: depthSchema,
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ name, maxDepth }) => {
      const schema = service.getSchema(name, { maxDepth });
      return schema
        ? success(schema)
        : failure(`Schema not found: ${name}`, {
            availableSchemas: service.listSchemas().slice(0, 100),
          });
    },
  );

  server.registerTool(
    "list_groups",
    {
      title: "List OpenAPI groups",
      description: "List tags with their operation counts.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async () => success({ groups: service.listGroups() }),
  );

  return server;
}

function success(data: JsonObject) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

function failure(message: string, details: JsonObject = {}) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
    structuredContent: { error: message, ...details },
  };
}
