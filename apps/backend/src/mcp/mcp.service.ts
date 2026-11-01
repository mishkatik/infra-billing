import { Injectable, Logger } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import axios, { type AxiosInstance } from 'axios';
import { z } from 'zod';
import { API_PREFIX, type ApiTokenScope } from '@infra/shared';
import { AppConfigService } from '@config/app-config.service';
import { type McpOperation, McpCatalog } from './mcp.catalog';

/** Who is calling: the request's API token, forwarded as-is to the proxied REST calls. */
export interface McpCaller {
  tokenName: string;
  scope: ApiTokenScope;
  authorization: string;
}

// Sync-all waits for every account; connector calls have their own shorter timeouts.
const CALL_TIMEOUT_MS = 180_000;
// Roughly 12k tokens. Bigger answers are cut and the client is told to narrow the request.
const MAX_RESULT_CHARS = 50_000;

const INSTRUCTIONS = `Personal infrastructure billing panel: hosting providers, their accounts and balances, paid services (servers, domains, storage, licenses), payments, exchange rates and spend analytics.

Workflow: list_operations shows what this token can do, describe_operation gives the parameters, body and response schemas of one operation, call_operation runs it. Simple GET operations can be called straight from the list.

Conventions: money amounts are decimal strings, each in its own currency (ISO code alongside); analytics totals are converted to the base currency from settings.get. Timestamps are ISO 8601 in UTC. IDs are UUIDs: look them up with providers.list, services.list or projects.list instead of guessing.

Start with analytics.summary for spend, upcoming billings and low balances. Sync operations call the providers' APIs and wait for the result.`;

@Injectable()
export class McpService {
  private readonly logger = new Logger('MCP');
  private readonly http: AxiosInstance;

  constructor(
    private readonly catalog: McpCatalog,
    private readonly config: AppConfigService,
  ) {
    // Operations go back through our own HTTP stack, so the guard, zod pipes and error filter
    // apply exactly as they do to any other API client.
    this.http = axios.create({
      baseURL: `http://127.0.0.1:${config.port}/${API_PREFIX}`,
      timeout: CALL_TIMEOUT_MS,
      validateStatus: () => true,
      maxRedirects: 0,
      proxy: false,
    });
  }

  /** A fresh server per request: the transport is stateless and tools depend on the caller. */
  createServer(caller: McpCaller): McpServer {
    const server = new McpServer(
      { name: 'infra-billing', version: this.config.buildInfo.version },
      { instructions: INSTRUCTIONS },
    );
    const readOnly = caller.scope === 'read';

    server.registerTool(
      'list_operations',
      {
        description:
          'List the panel API operations available to this token: name, HTTP method, path, ' +
          'summary, access level (read, write or destructive) and parameter names.',
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async () =>
        result({
          operations: this.catalog.list(caller.scope).map((op) => ({
            name: op.name,
            method: op.method,
            path: op.path,
            summary: op.summary,
            access: op.access,
            pathParams: op.pathParams,
            query: op.queryParams,
            hasBody: Boolean(op.body),
          })),
        }),
    );

    server.registerTool(
      'describe_operation',
      {
        description:
          'Describe one operation: path and query parameters, request body and response as ' +
          'JSON Schema, plus usage notes.',
        inputSchema: { operation: z.string().describe('Operation name from list_operations') },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ operation }) => {
        const op = this.resolve(operation, caller);
        if (typeof op === 'string') return failure(op);
        const { name, method, path, summary, access, notes, pathParams, query, body, response } =
          op;
        return result({
          name,
          method,
          path,
          summary,
          access,
          notes,
          pathParams,
          query,
          body,
          response,
        });
      },
    );

    server.registerTool(
      'call_operation',
      {
        description:
          'Call an operation by name. Path parameters go in `path` (e.g. {"uuid": "…"}), query ' +
          'parameters in `query`, the JSON request body in `body`. Returns the JSON response; ' +
          'validation errors explain what to fix.',
        inputSchema: {
          operation: z.string().describe('Operation name from list_operations'),
          path: z.record(z.string()).optional().describe('Path parameters'),
          query: z
            .record(z.union([z.string(), z.number(), z.boolean()]))
            .optional()
            .describe('Query parameters'),
          body: z.record(z.unknown()).optional().describe('JSON request body'),
        },
        // A read-only token can't change anything, so clients may auto-approve its calls.
        annotations: readOnly
          ? { readOnlyHint: true, openWorldHint: false }
          : { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
      },
      async (args) => this.call(caller, args),
    );

    return server;
  }

  private resolve(name: string, caller: McpCaller): McpOperation | string {
    const op = this.catalog.get(name);
    if (!op) return `Unknown operation "${name}". Call list_operations for the available ones.`;
    if (!this.catalog.allows(op, caller.scope)) {
      return `${name} changes data and this API token is read-only.`;
    }
    return op;
  }

  private async call(
    caller: McpCaller,
    args: {
      operation: string;
      path?: Record<string, string>;
      query?: Record<string, string | number | boolean>;
      body?: Record<string, unknown>;
    },
  ): Promise<CallToolResult> {
    const op = this.resolve(args.operation, caller);
    if (typeof op === 'string') return failure(op);

    const missing = op.pathParams.filter((p) => !args.path?.[p]);
    if (missing.length) return failure(`Missing path parameters: ${missing.join(', ')}`);
    const url = op.path.replace(/\{(\w+)\}/g, (_, p: string) => encodeURIComponent(args.path![p]));

    try {
      const res = await this.http.request({
        method: op.method,
        url,
        params: args.query,
        data: args.body,
        headers: { authorization: caller.authorization },
      });
      this.logger.log(`${caller.tokenName}: ${op.name} → ${res.status}`);
      if (res.status >= 200 && res.status < 300) {
        return result(res.status === 204 || res.data === '' ? { ok: true } : res.data);
      }
      return failure({ status: res.status, error: res.data?.error ?? res.data });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn(`${caller.tokenName}: ${op.name} failed: ${message}`);
      return failure(`Request failed: ${message}`);
    }
  }
}

function result(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: truncate(JSON.stringify(data)) }] };
}

function failure(error: unknown): CallToolResult {
  const text = typeof error === 'string' ? error : JSON.stringify(error);
  return { content: [{ type: 'text', text: truncate(text) }], isError: true };
}

function truncate(text: string): string {
  if (text.length <= MAX_RESULT_CHARS) return text;
  return (
    `${text.slice(0, MAX_RESULT_CHARS)}\n…truncated (${text.length} characters in total). ` +
    'Narrow the request with filters or pagination.'
  );
}
