-- Shared-account guard (T-ACC-05 follow-up; C-094, ADR-003). A user_account has one password, one
-- second factor and one lock across every hospital it belongs to. An administrator must not
-- change those when the account also belongs to another hospital, but RLS hides that membership.

-- The function below runs as its owner, and FORCE RLS applies to owners too. This policy is limited
-- to the migrator role and read-only, so hms_app still sees only its own hospital's rows.
CREATE POLICY membership_guard_read ON hms.membership FOR SELECT TO hms_migrator USING (true);

-- Answers one yes or no question and returns no membership data. With no current hospital every
-- membership counts as elsewhere, so a missing context refuses the change instead of allowing it.
CREATE FUNCTION hms.user_belongs_elsewhere(p_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = hms, pg_temp AS
$$ SELECT EXISTS (
     SELECT 1 FROM hms.membership m
      WHERE m.user_id = p_user_id
        AND m.tenant_id IS DISTINCT FROM hms.current_tenant_id()
        AND m.status <> 'REVOKED') $$;

REVOKE ALL ON FUNCTION hms.user_belongs_elsewhere(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hms.user_belongs_elsewhere(uuid) TO hms_app;
