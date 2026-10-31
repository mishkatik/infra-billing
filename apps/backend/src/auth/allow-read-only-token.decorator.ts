import { SetMetadata } from '@nestjs/common';

export const ALLOW_READ_ONLY_TOKEN_KEY = 'allowReadOnlyToken';

/**
 * Lets read-only API tokens call a non-GET route. Only for routes that don't write themselves and
 * re-enter the guard for every real operation (the MCP endpoint speaks JSON-RPC over POST).
 */
export const AllowReadOnlyToken = () => SetMetadata(ALLOW_READ_ONLY_TOKEN_KEY, true);
