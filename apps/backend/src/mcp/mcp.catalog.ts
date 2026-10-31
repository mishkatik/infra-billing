import { Injectable } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { API_PREFIX, type ApiTokenScope } from '@infra/shared';
import { MCP_OPERATIONS, type McpOperationSpec } from './mcp.operations';

type JsonSchema = Record<string, unknown>;
type Operation = NonNullable<OpenAPIObject['paths'][string]['get']>;

export interface McpOperation extends McpOperationSpec {
  summary: string;
  pathParams: string[];
  queryParams: string[];
  query?: JsonSchema;
  body?: JsonSchema;
  response?: JsonSchema;
}

const REF_PREFIX = '#/components/schemas/';
// Deep enough for provider → accounts → balances; cuts self-references and runaway nesting.
const MAX_REF_DEPTH = 6;

/** MCP operations resolved against the OpenAPI document: summaries, parameters and schemas. */
@Injectable()
export class McpCatalog {
  private readonly operations = new Map<string, McpOperation>();

  /** Called once at bootstrap. A listed operation missing from the document is a startup error. */
  load(document: OpenAPIObject): void {
    const components = (document.components?.schemas ?? {}) as Record<string, JsonSchema>;
    const inline = (schema: unknown) => inlineRefs(schema, components, []) as JsonSchema;

    for (const spec of MCP_OPERATIONS) {
      const op = document.paths[`/${API_PREFIX}${spec.path}`]?.[
        spec.method.toLowerCase() as 'get'
      ] as Operation | undefined;
      if (!op) throw new Error(`MCP operation ${spec.name}: ${spec.method} ${spec.path} not found`);

      const params = (op.parameters ?? []).filter(
        (p): p is Extract<typeof p, { in: string }> => 'in' in p,
      );
      const pathParams = params.filter((p) => p.in === 'path').map((p) => p.name);
      const queryParams = params.filter((p) => p.in === 'query');

      const body =
        op.requestBody && 'content' in op.requestBody
          ? op.requestBody.content['application/json']?.schema
          : undefined;
      const ok = Object.entries(op.responses ?? {}).find(([code]) => code.startsWith('2'))?.[1];
      const response = ok && 'content' in ok ? ok.content?.['application/json']?.schema : undefined;

      this.operations.set(spec.name, {
        ...spec,
        summary: op.summary ?? '',
        pathParams,
        queryParams: queryParams.map((p) => p.name),
        query: queryParams.length
          ? {
              type: 'object',
              properties: Object.fromEntries(
                queryParams.map((p) => [
                  p.name,
                  { ...inline(p.schema), ...(p.description && { description: p.description }) },
                ]),
              ),
              required: queryParams.filter((p) => p.required).map((p) => p.name),
            }
          : undefined,
        body: body ? inline(body) : undefined,
        response: response ? inline(response) : undefined,
      });
    }
  }

  get(name: string): McpOperation | undefined {
    return this.operations.get(name);
  }

  /** Read-only tokens see and call only read operations. */
  allows(op: McpOperationSpec, scope: ApiTokenScope): boolean {
    return scope === 'full' || op.access === 'read';
  }

  list(scope: ApiTokenScope): McpOperation[] {
    return [...this.operations.values()].filter((op) => this.allows(op, scope));
  }
}

/** Replace `$ref`s to components with the schemas themselves, so each operation is self-contained. */
export function inlineRefs(
  node: unknown,
  components: Record<string, JsonSchema>,
  seen: string[],
): unknown {
  if (Array.isArray(node)) return node.map((n) => inlineRefs(n, components, seen));
  if (!node || typeof node !== 'object') return node;

  const { $ref, ...rest } = node as JsonSchema;
  if (typeof $ref === 'string' && $ref.startsWith(REF_PREFIX)) {
    const name = $ref.slice(REF_PREFIX.length);
    const target = components[name];
    if (!target || seen.includes(name) || seen.length >= MAX_REF_DEPTH) {
      return { description: `${name} (nested, omitted)` };
    }
    return { ...(inlineRefs(target, components, [...seen, name]) as JsonSchema), ...rest };
  }
  return Object.fromEntries(
    Object.entries(node).map(([k, v]) => [k, inlineRefs(v, components, seen)]),
  );
}
