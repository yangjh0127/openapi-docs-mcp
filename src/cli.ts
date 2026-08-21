#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { loadOpenApi } from "./openapi/loader.js";
import { formatDiagnosticSummary } from "./openapi/diagnostics.js";
import { createMcpServer } from "./mcp/server.js";
import { OpenApiService } from "./service.js";

interface CliOptions {
  source: string;
  timeoutMs?: number;
  headers: Record<string, string>;
  strictValidation: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const context = await loadOpenApi(options.source, {
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ...(Object.keys(options.headers).length ? { headers: options.headers } : {}),
    validationMode: options.strictValidation ? "strict" : "compatible",
  });
  const service = new OpenApiService(context);

  console.error(
    `Loaded ${context.operations.length} operations from ${context.source} (OpenAPI ${context.version})`,
  );
  for (const line of formatDiagnosticSummary(context.diagnostics)) {
    console.error(line);
  }
  serveStdio(() => createMcpServer(service), {
    onerror: (error) => console.error(error),
  });
}

export function parseArgs(args: string[]): CliOptions {
  let source: string | undefined;
  let timeoutMs: number | undefined;
  let strictValidation = false;
  const headers: Record<string, string> = {};

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--source" || argument === "-s") {
      source = requireValue(args, ++index, argument);
    } else if (argument === "--timeout") {
      const raw = requireValue(args, ++index, argument);
      timeoutMs = Number(raw);
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error("--timeout must be a positive number in milliseconds");
      }
    } else if (argument === "--header") {
      const raw = requireValue(args, ++index, argument);
      const separator = raw.indexOf("=");
      if (separator <= 0) throw new Error("--header must use NAME=VALUE");
      headers[raw.slice(0, separator)] = raw.slice(separator + 1);
    } else if (argument === "--strict-validation") {
      strictValidation = true;
    } else if (argument === "--help" || argument === "-h") {
      printHelp();
      process.exit(0);
    } else if (argument?.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    } else if (argument) {
      if (source) throw new Error("Only one OpenAPI source may be provided");
      source = argument;
    }
  }

  if (!source) {
    throw new Error("Missing OpenAPI source. Pass --source <file-or-url>.");
  }
  return {
    source,
    headers,
    strictValidation,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  };
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value) throw new Error(`Missing value for ${option}`);
  return value;
}

function printHelp(): void {
  console.error(`Usage: openapi-docs-mcp --source <file-or-url> [options]

Options:
  -s, --source <value>   OpenAPI JSON/YAML file or HTTP(S) URL
      --header NAME=VALUE  Header used when loading a remote document (repeatable)
      --timeout <ms>       Remote loading timeout (default: 10000)
      --strict-validation  Reject every OpenAPI validation warning
  -h, --help             Show this help`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
