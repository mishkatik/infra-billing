#!/usr/bin/env node
import { PrismaPg } from '@prisma/adapter-pg';
import { consola } from 'consola';
import { PrismaClient } from '@generated/prisma/client';

// Standalone maintenance CLI (no NestJS). It exists for owners running the production
// docker-compose stack, who have no Taskfile or source checkout. Run it inside the app container:
//
//   docker compose exec -it infra-billing cli             # interactive menu
//   docker compose exec infra-billing cli reset-admin -y  # non-interactive
//
// DATABASE_URL comes from the container env (compose `env_file`), same as the app.

const ACTION = {
  RESET_ADMIN: 'reset-admin',
  EXIT: 'exit',
} as const;
type Action = (typeof ACTION)[keyof typeof ACTION];

function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    consola.error('DATABASE_URL is not set — run this inside the app container.');
    process.exit(1);
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Wipe the admin account + every passkey so the app shows the first-run setup screen again.
// This is the recovery path when the password is forgotten and no usable passkey remains.
async function resetAdmin(prisma: PrismaClient, skipConfirm: boolean): Promise<void> {
  if (!skipConfirm) {
    const ok = await consola.prompt(
      'Reset the admin account? This deletes the login, password and all passkeys — you will need to go through first-run setup again.',
      { type: 'confirm', initial: false },
    );
    if (ok !== true) {
      consola.info('Cancelled.');
      return;
    }
  }
  const { count } = await prisma.passkey.deleteMany();
  await prisma.authConfig.deleteMany();
  consola.success(
    `Admin account reset (passkeys deleted: ${count}). Open the panel to create a new account.`,
  );
}

async function pickAction(): Promise<Action> {
  const choice = await consola.prompt('Select an action', {
    type: 'select',
    initial: ACTION.RESET_ADMIN,
    options: [
      { label: 'Reset admin account (login / password / passkeys)', value: ACTION.RESET_ADMIN },
      { label: 'Exit', value: ACTION.EXIT },
    ],
  });
  // consola hands back the initial value on cancel (Ctrl+C); treat anything unexpected as exit.
  return choice === ACTION.RESET_ADMIN ? ACTION.RESET_ADMIN : ACTION.EXIT;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const skipConfirm = args.includes('-y') || args.includes('--yes');
  const action =
    (args.find((a) => !a.startsWith('-')) as Action | undefined) ?? (await pickAction());

  if (action === ACTION.EXIT) {
    consola.info('Exiting.');
    return;
  }

  const prisma = createPrisma();
  try {
    switch (action) {
      case ACTION.RESET_ADMIN:
        await resetAdmin(prisma, skipConfirm);
        break;
      default:
        consola.error(`Unknown action: ${action}`);
        process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  consola.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
