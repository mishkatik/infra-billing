import { All, Controller, ForbiddenException, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Response } from 'express';
import { API } from '@infra/shared';
import { AllowReadOnlyToken } from '../auth/allow-read-only-token.decorator';
import type { AuthedRequest } from '../auth/auth.guard';
import { McpService } from './mcp.service';

// JSON-RPC, not REST: kept out of the OpenAPI document (and therefore out of its own catalog).
// Read-only tokens may POST here; every proxied operation goes through the guard again.
@ApiExcludeController()
@AllowReadOnlyToken()
@Controller(API.MCP)
export class McpController {
  constructor(private readonly mcp: McpService) {}

  @Post()
  async handle(@Req() req: AuthedRequest, @Res() res: Response): Promise<void> {
    // Proxied calls re-authenticate with the same Bearer header, and a session cookie would also
    // open the session-only routes, so MCP is token-only.
    if (req.authType !== 'token') throw new ForbiddenException('Use an API token');

    const server = this.mcp.createServer({
      tokenName: req.user!,
      scope: req.tokenScope!,
      authorization: req.headers.authorization!,
    });
    // Stateless with plain JSON responses: no sessions to keep and no SSE for proxies to buffer.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  // No SSE stream to open (GET) and no session to end (DELETE) on a stateless server.
  @All()
  @HttpCode(405)
  notAllowed() {
    return { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null };
  }
}
