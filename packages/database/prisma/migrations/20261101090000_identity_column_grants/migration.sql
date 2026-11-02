-- Column-level UPDATE on the identity tables (E section 6, follow-up from the T-ACC-01 security
-- review). These tables have no row-level security because identity is global, so grants are the
-- only database limit on what the app role can change. A bug or injection in the API must not be
-- able to rename an account, move a session to another user or extend a session's 12-hour limit.
--
-- Safe for the running version: the code only updates the columns granted here, and every other
-- privilege is unchanged. A new feature that changes another column adds its grant in its own
-- migration (for example display_name, which has no edit screen yet).

REVOKE UPDATE ON hms.user_account FROM hms_app;
GRANT UPDATE (
  password_hash,
  status,
  failed_attempts,
  locked_until,
  lock_reason,
  locked_at,
  lock_note,
  locked_by_user_id,
  must_change_password,
  password_changed_at,
  preferred_lang,
  version
) ON hms.user_account TO hms_app;

-- mfa_verified_at and absolute_expires_at are set only when a session is created: passing the
-- second factor replaces the session (T-ACC-04), and the absolute limit never moves (C-032).
REVOKE UPDATE ON hms.user_session FROM hms_app;
GRANT UPDATE (last_seen_at, idle_expires_at, revoked_at) ON hms.user_session TO hms_app;
