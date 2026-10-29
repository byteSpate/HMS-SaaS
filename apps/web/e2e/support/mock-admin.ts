// In-memory stand-in for the hospital administration endpoints (T-ACC-05), answering with
// payloads that satisfy the shared contracts. Used by the admin screen browser tests; the real
// behaviour is covered by apps/api/src/user-admin.api.spec.ts.
import {
  type AdminRole,
  adminRoleListSchema,
  adminRoleSchema,
  type AdminUser,
  adminUserListSchema,
  adminUserSchema,
  type PermissionCode,
} from '@hms/contracts';

const ID = (n: number): string => `0199e0a0-0000-7000-8000-${String(n).padStart(12, '0')}`;

export interface AdminAnswer {
  status: number;
  body?: unknown;
}

const TEMPLATES = [
  { code: 'CSH', nameEn: 'Cashier', permissions: ['billing.payment.record'] as PermissionCode[] },
  {
    code: 'ADM',
    nameEn: 'Hospital administrator',
    permissions: ['admin.user.manage'] as PermissionCode[],
  },
];

export function createAdminStore() {
  let next = 100;
  const roles: AdminRole[] = [
    {
      id: ID(51),
      code: 'CSH',
      nameEn: 'Cashier',
      nameBn: null,
      templateCode: 'CSH',
      permissions: ['billing.payment.record'],
      memberCount: 1,
    },
  ];
  const users: AdminUser[] = [
    {
      userId: ID(61),
      username: 'karim',
      displayName: 'Karim Hossain',
      accountStatus: 'ACTIVE',
      lockedUntil: null,
      membershipId: ID(71),
      membershipStatus: 'ACTIVE',
      roles: [{ id: ID(51), code: 'CSH', nameEn: 'Cashier', nameBn: null }],
      mfaEnrolled: false,
      mustChangePassword: false,
    },
  ];

  const summaries = () =>
    roles.map(({ id, code, nameEn, nameBn }) => ({ id, code, nameEn, nameBn }));

  function createUser(body: { username: string; displayName: string; roleIds: string[] }) {
    next += 2;
    const user = adminUserSchema.parse({
      userId: ID(next),
      username: body.username,
      displayName: body.displayName,
      accountStatus: 'ACTIVE',
      lockedUntil: null,
      membershipId: ID(next + 1),
      membershipStatus: 'ACTIVE',
      roles: summaries().filter((role) => body.roleIds.includes(role.id)),
      mfaEnrolled: false,
      mustChangePassword: true,
    });
    users.push(user);
    return user;
  }

  function createRole(body: { code: string; nameEn: string; permissions: PermissionCode[] }) {
    next += 1;
    const role = adminRoleSchema.parse({
      id: ID(next),
      code: body.code,
      nameEn: body.nameEn,
      nameBn: null,
      templateCode: null,
      permissions: body.permissions,
      memberCount: 0,
    });
    roles.push(role);
    return role;
  }

  function setPermissions(roleId: string, body: { permissions: PermissionCode[] }): AdminAnswer {
    const role = roles.find((item) => item.id === roleId);
    if (!role) return { status: 404 };
    role.permissions = [...body.permissions];
    return { status: 200, body: adminRoleSchema.parse(role) };
  }

  /** Null when the path is not an admin endpoint this mock knows. */
  function answer(method: string, path: string, body: never): AdminAnswer | null {
    if (path === '/admin/users' && method === 'GET') {
      return { status: 200, body: adminUserListSchema.parse({ users, roles: summaries() }) };
    }
    if (path === '/admin/users' && method === 'POST')
      return { status: 201, body: createUser(body) };
    if (path === '/admin/roles' && method === 'GET') {
      return { status: 200, body: adminRoleListSchema.parse({ roles, templates: TEMPLATES }) };
    }
    if (path === '/admin/roles' && method === 'POST')
      return { status: 201, body: createRole(body) };
    const permissionsPath = /^\/admin\/roles\/([^/]+)\/permissions$/.exec(path);
    if (permissionsPath?.[1] && method === 'PUT') return setPermissions(permissionsPath[1], body);
    return null;
  }

  return { answer, users, roles };
}
