import { SetMetadata } from '@nestjs/common';

export const IS_ANY_PRINCIPAL_KEY = 'isAnyPrincipal';

/** Opens an endpoint to every authenticated principal (admin and any member). */
export const AnyPrincipal = () => SetMetadata(IS_ANY_PRINCIPAL_KEY, true);
