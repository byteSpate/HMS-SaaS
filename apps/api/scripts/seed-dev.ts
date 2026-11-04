// Development seed: one demo hospital with the nine template roles (C-045), an administrator
// and a receptionist, so the staff app can be tried by hand on a fresh local database.
// Synthetic data only (AS-009). Run with `pnpm db:seed:dev` after `pnpm db:deploy`.
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { coreModules, moduleCodes } from '@hms/contracts';
import { createPrismaClient, withTenant, type PrismaClient } from '@hms/database';
import { createRolesFromTemplates, hashPassword } from '@hms/mod-identity-access';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const DEMO_HOSPITAL_CODE = 'demo';

// DEV ONLY credentials, like the values in .env.example. Never used outside a local database.
/* eslint-disable sonarjs/no-hardcoded-passwords -- synthetic, and requireLocalDatabase guards it */
const DEMO_USERS = [
  { username: 'admin', displayName: 'Demo Administrator', password: 'Admin-dev-2026', role: 'ADM' },
  {
    username: 'reception',
    displayName: 'Demo Receptionist',
    password: 'Reception-dev-2026',
    role: 'RCP',
  },
] as const;
/* eslint-enable sonarjs/no-hardcoded-passwords */

function requireLocalDatabase(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set; copy .env.example to .env');
  // The seed creates known passwords, so it must never reach a shared or real database.
  const host = new URL(url).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to seed a non-local database (${host})`);
  }
  return url;
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
  const prisma = createPrismaClient(requireLocalDatabase());
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
    const hashes = await Promise.all(DEMO_USERS.map((user) => hashPassword(user.password)));
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
    for (const user of DEMO_USERS) {
      console.log(`  ${user.username} / ${user.password}  (role ${user.role})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

await seed();
