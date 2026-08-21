import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@infra/shared';

export const REQUIRE_PERM_KEY = 'requirePerm';

/** Opens an endpoint to member accounts holding the permission. Admin always passes. */
export const RequirePerm = (perm: Permission) => SetMetadata(REQUIRE_PERM_KEY, perm);
