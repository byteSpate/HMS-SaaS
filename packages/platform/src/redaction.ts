// What never reaches a log line (T-PLT-06; FR-AUD-006; NFR-OBS-001). Logs use record IDs and
// correlation IDs. pino matches paths exactly, with `*` standing for one level, so each name is
// listed at the depths a careless log call could reach. Names are compared in their exact case.
const SENSITIVE_NAMES = [
  'nid',
  'nationalId',
  'password',
  'passwordHash',
  'temporaryPassword',
  'currentPassword',
  'newPassword',
  'cookie',
  'cookies',
  'set-cookie',
  'authorization',
  'csrfToken',
  'token',
  'sessionToken',
  'accessToken',
  'refreshToken',
  'secret',
  'recoveryCodes',
  'cardNumber',
];

function bracket(name: string): string {
  return /^\w+$/.test(name) ? `.${name}` : `["${name}"]`;
}

export const REDACTED_LOG_PATHS: string[] = SENSITIVE_NAMES.flatMap((name) => {
  const part = bracket(name);
  return [part.slice(part.startsWith('.') ? 1 : 0), `*${part}`, `*.*${part}`, `*.*.*${part}`];
});
