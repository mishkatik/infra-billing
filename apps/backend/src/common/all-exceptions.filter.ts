import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/** Uniform error envelope: { error: { code, message } }. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const m = (body as { message?: unknown }).message;
        message = Array.isArray(m) ? m.join('; ') : typeof m === 'string' ? m : exception.message;
      }
    }

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${redactInviteToken(req.originalUrl)} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json({ error: { code: statusToCode(status), message } });
  }
}

/** The raw invite/reset token must never land in logs — only the path shape, not the secret. */
function redactInviteToken(url: string): string {
  return url.replace(/(\/accounts\/invite\/)[^/?]+/, '$1<redacted>');
}

function statusToCode(status: number): string {
  switch (status) {
    case 400:
      return 'bad_request';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    default:
      return status >= 500 ? 'internal_error' : 'error';
  }
}
