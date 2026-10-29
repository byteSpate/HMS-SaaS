// Development seed: one demo hospital with the nine template roles (C-045), an administrator
// and a receptionist, so the staff app can be tried by hand on a fresh local database.
// Synthetic data only (AS-009). Run with `pnpm db:seed:dev` after `pnpm db:deploy`.
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { createPrismaClient, withTenant } from '@hms/database';
import { createRolesFromTemplates, hashPassword } from '@hms/mod-identity-access';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

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

async function seed(): Promise<void> {
  const prisma = createPrismaClient(requireLocalDatabase());
  try {
    const existing = await prisma.userAccount.findUnique({ where: { username: 'admin' } });
    if (existing) {
      console.log('Already seeded: user "admin" exists. Nothing changed.');
      return;
    }

    // argon2 is slow, so hash before the transaction (withTenant allows 5 seconds).
    const hashes = await Promise.all(DEMO_USERS.map((user) => hashPassword(user.password)));
    const tenantId = randomUUID();

    await withTenant(prisma, { tenantId }, async (tx) => {
      await tx.tenant.create({
        data: { id: tenantId, code: 'demo', nameEn: 'Demo Hospital', status: 'ACTIVE' },
      });
      const roleIds = await createRolesFromTemplates(tx, tenantId);
      for (const [index, user] of DEMO_USERS.entries()) {
        const account = await tx.userAccount.create({
          data: {
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

    console.log('Seeded "Demo Hospital" with the nine template roles. Sign in at /staff:');
    for (const user of DEMO_USERS) {
      console.log(`  ${user.username} / ${user.password}  (role ${user.role})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

await seed();
