// Public entry of the identity and access module (D section 5 rule 3): other packages and apps
// import only from here.
export {
  AUTH_CONFIG,
  CLOCK,
  DEFAULT_LOGIN_RATE_LIMITS,
  loadAuthConfig,
  type AuthConfig,
} from './application/auth.config.js';
export { AuthService, type AuthContext, type RequestMeta } from './application/auth.service.js';
export { AllowWithoutTenant, Public, RequirePermission } from './http/decorators.js';
export { getAuthContext, type AuthenticatedRequest } from './http/request-context.js';
export { findRoutesWithoutMarker } from './http/route-markers.js';
export { SESSION_COOKIE } from './http/session-cookie.js';
export {
  isSelectableDepartment,
  listDepartmentChoices,
} from './infrastructure/department.repository.js';
export { IdentityAccessModule, type IdentityAccessOptions } from './identity-access.module.js';
export { hashPassword } from './infrastructure/password-hasher.js';
export { createRolesFromTemplates } from './infrastructure/role-templates.repository.js';
