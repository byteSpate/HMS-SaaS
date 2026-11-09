// Development seed: one demo hospital with the nine template roles (C-045), an administrator
// and a receptionist, so the staff app can be tried by hand on a fresh database.
// Synthetic data only (AS-009). Run with `pnpm db:seed:dev` after `pnpm db:deploy`.
// A shared database (Supabase staging) needs SEED_ADMIN_PASSWORD and SEED_RECEPTION_PASSWORD,
// so the well-known dev passwords never reach it. Stop-gap until T-SAA-01 provisions tenants.
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { coreModules, moduleCodes } from '@hms/contracts';
import { createPrismaClient, withTenant, type PrismaClient } from '@hms/database';
import { createRolesFromTemplates, hashPassword } from '@hms/mod-identity-access';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const DEMO_HOSPITAL_CODE = 'demo';

// DEV ONLY credentials, like the values in .env.example. Used on a local database only.
/* eslint-disable sonarjs/no-hardcoded-passwords -- synthetic, and passwordsFor guards them */
const DEMO_USERS = [
  {
    username: 'admin',
    displayName: 'Demo Administrator',
    devPassword: 'Admin-dev-2026',
    passwordVariable: 'SEED_ADMIN_PASSWORD',
    role: 'ADM',
  },
  {
    username: 'reception',
    displayName: 'Demo Receptionist',
    devPassword: 'Reception-dev-2026',
    passwordVariable: 'SEED_RECEPTION_PASSWORD',
    role: 'RCP',
  },
] as const;
/* eslint-enable sonarjs/no-hardcoded-passwords */

const MIN_SHARED_PASSWORD_LENGTH = 12;

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set; copy .env.example to .env');
  return url;
}

function isLocalHost(url: string): boolean {
  const host = new URL(url).hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

/**
 * The password of each demo user. Locally the known dev passwords; on a shared database the
 * dev passwords would let anyone who can reach the site sign in, so each must come from its
 * SEED_*_PASSWORD variable and must not be the dev one.
 */
function passwordsFor(url: string): string[] {
  if (isLocalHost(url)) return DEMO_USERS.map((user) => user.devPassword);
  const host = new URL(url).hostname;
  return DEMO_USERS.map((user) => {
    const password = process.env[user.passwordVariable];
    if (!password || password.length < MIN_SHARED_PASSWORD_LENGTH) {
      throw new Error(
        `Refusing to seed ${host}: set ${user.passwordVariable} (at least ${MIN_SHARED_PASSWORD_LENGTH} characters)`,
      );
    }
    if (password === user.devPassword) {
      throw new Error(
        `Refusing to seed ${host}: ${user.passwordVariable} is the public dev password`,
      );
    }
    return password;
  });
}

/**
 * The demo hospital has every module, so each screen can be tried by hand (FR-SAA-004). Runs on
 * every seed, so a database seeded before a module existed gets it too.
 */
async function enableAllModules(prisma: PrismaClient, tenantId: string): Promise<void> {
  const modules = moduleCodes.filter((code) => !coreModules.has(code));
  await withTenant(prisma, { tenantId }, (tx) =>
    tx.tenantEntitlement.createMany({
      data: modules.map((moduleCode) => ({ tenantId, moduleCode })),
      skipDuplicates: true,
    }),
  );
}

async function seed(): Promise<void> {
  const url = requireDatabaseUrl();
  const passwords = passwordsFor(url);
  const prisma = createPrismaClient(url);
  try {
    // Usernames are unique per hospital (C-099), so look for the demo hospital itself, by the same
    // lookup sign-in uses: hms_app cannot read hms.tenant without a hospital context.
    const [demo] = await prisma.$queryRaw<{ id: string | null }[]>`
      SELECT hms.tenant_id_for_login(${DEMO_HOSPITAL_CODE}) AS id`;
    if (demo?.id) {
      await enableAllModules(prisma, demo.id);
      console.log('Already seeded: hospital "demo" exists. Made sure every module is enabled.');
      return;
    }

    // argon2 is slow, so hash before the transaction (withTenant allows 5 seconds).
    const hashes = await Promise.all(passwords.map((password) => hashPassword(password)));
    const tenantId = randomUUID();

    await withTenant(prisma, { tenantId }, async (tx) => {
      await tx.tenant.create({
        data: { id: tenantId, code: DEMO_HOSPITAL_CODE, nameEn: 'Demo Hospital', status: 'ACTIVE' },
      });
      const roleIds = await createRolesFromTemplates(tx, tenantId);
      for (const [index, user] of DEMO_USERS.entries()) {
        const account = await tx.userAccount.create({
          data: {
            tenantId,
            username: user.username,
            displayName: user.displayName,
            passwordHash: hashes[index]!,
            preferredLang: 'en',
          },
        });
        await tx.membership.create({
          data: {
            tenantId,
            userId: account.id,
            roles: { create: { roleId: roleIds[user.role] } },
          },
        });
      }
    });
    await enableAllModules(prisma, tenantId);

    console.log(
      'Seeded "Demo Hospital" with the nine template roles. Sign in at /staff with hospital code demo:',
    );
    // On a shared database the passwords came from SEED_*_PASSWORD; never echo them into a log.
    const local = isLocalHost(url);
    for (const user of DEMO_USERS) {
      const shown = local ? user.devPassword : `(${user.passwordVariable})`;
      console.log(`  ${user.username} / ${shown}  (role ${user.role})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

await seed();
