import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Principal } from './principal';

/** The principal resolved by AuthGuard for this request. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal =>
    ctx.switchToHttp().getRequest<{ principal: Principal }>().principal,
);
