import type {
  JsonObject,
  OpenApiContext,
  SchemaFormatOptions,
  SearchOptions,
} from "./types.js";
import { formatOperation } from "./formatter/operation.js";
import { findSchema, formatSchema, listSchemaNames } from "./formatter/schema.js";
import { findOperation } from "./openapi/operations.js";
import { searchOperations } from "./search/search.js";

export interface ReloadResult extends JsonObject {
  source: string;
  version: string;
  previousOperationCount: number;
  operationCount: number;
  validationWarnings: OpenApiContext["validationWarnings"];
}

export type OpenApiReloader = () => Promise<OpenApiContext>;

export class OpenApiService {
  context: OpenApiContext;
  private reloadPromise: Promise<ReloadResult> | undefined;

  constructor(context: OpenApiContext, private readonly reloader?: OpenApiReloader) {
    this.context = context;
  }

  async reload(): Promise<ReloadResult> {
    if (!this.reloader) {
      throw new Error("Document reload is not configured for this service");
    }
    if (this.reloadPromise) return await this.reloadPromise;

    const promise = this.performReload();
    this.reloadPromise = promise;
    try {
      return await promise;
    } finally {
      if (this.reloadPromise === promise) this.reloadPromise = undefined;
    }
  }

  private async performReload(): Promise<ReloadResult> {
    const previousOperationCount = this.context.operations.length;
    const context = await this.reloader!();
    this.context = context;
    return {
      source: context.source,
      version: context.version,
      previousOperationCount,
      operationCount: context.operations.length,
      validationWarnings: context.validationWarnings,
    };
  }

  search(options: SearchOptions) {
    return searchOperations(this.context.operations, options);
  }

  getApi(
    input: { id?: string; path?: string; method?: string },
    options: SchemaFormatOptions = {},
  ) {
    const operation = findOperation(this.context.operations, input);
    return operation
      ? formatOperation(this.context.document, operation, options)
      : undefined;
  }

  getSchema(name: string, options: SchemaFormatOptions = {}) {
    const schema = findSchema(this.context.document, name);
    return schema === undefined
      ? undefined
      : { name, schema: formatSchema(this.context.document, schema, options) };
  }

  listGroups() {
    const groups = new Map<string, number>();
    for (const operation of this.context.operations) {
      const tags = operation.tags.length ? operation.tags : ["untagged"];
      for (const tag of tags) groups.set(tag, (groups.get(tag) ?? 0) + 1);
    }
    return [...groups.entries()]
      .map(([name, operationCount]) => ({ name, operationCount }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  listSchemas() {
    return listSchemaNames(this.context.document);
  }
}

