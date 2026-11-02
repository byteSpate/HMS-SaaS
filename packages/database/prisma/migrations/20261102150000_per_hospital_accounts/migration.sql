-- One account per hospital, usernames unique within a hospital (T-ACC-06; C-099; C-094).
-- An expand step: tenant_id stays nullable, so the previous version can keep inserting users while
-- this deploys. A later release can make it NOT NULL once every row has one.
ALTER TABLE hms.user_account ADD COLUMN "tenant_id" UUID;
ALTER TABLE hms.user_account ADD CONSTRAINT "user_account_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Each account stays with its active hospital, or else its earliest one.
UPDATE hms.user_account u
   SET tenant_id = (
     SELECT m.tenant_id FROM hms.membership m
      WHERE m.user_id = u.id
      ORDER BY (m.status = 'ACTIVE') DESC, m.created_at ASC
      LIMIT 1);

-- Any other membership ends. Only demo and test data can have one: no route could create it.
CREATE POLICY backfill_memberships ON hms.membership FOR UPDATE TO hms_migrator USING (true);
UPDATE hms.membership m
   SET status = 'REVOKED'
  FROM hms.user_account u
 WHERE u.id = m.user_id AND m.tenant_id IS DISTINCT FROM u.tenant_id AND m.status <> 'REVOKED';
DROP POLICY backfill_memberships ON hms.membership;

DROP INDEX hms.user_account_username_key;
CREATE UNIQUE INDEX "user_account_tenant_id_username_key"
  ON hms.user_account ("tenant_id", "username");

-- A new membership claims an account that has no hospital yet, and refuses one that has another.
-- The database holds this rule, because a shared account would let one hospital's administrator
-- reach another (the problem the earlier shared-account guard worked around).
CREATE FUNCTION hms.membership_keeps_one_hospital() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = hms, pg_temp AS $$
BEGIN
  UPDATE hms.user_account SET tenant_id = NEW.tenant_id
   WHERE id = NEW.user_id AND tenant_id IS NULL;
  IF NOT EXISTS (
    SELECT 1 FROM hms.user_account WHERE id = NEW.user_id AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'An account belongs to one hospital' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER membership_keeps_one_hospital
  BEFORE INSERT ON hms.membership
  FOR EACH ROW EXECUTE FUNCTION hms.membership_keeps_one_hospital();

-- Sign-in happens before any hospital context exists, and RLS hides hospitals from hms_app. This
-- answers one code with one ID, so hospitals cannot be listed. A terminated hospital is not found.
CREATE POLICY login_lookup ON hms.tenant FOR SELECT TO hms_migrator USING (true);

CREATE FUNCTION hms.tenant_id_for_login(p_code text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = hms, pg_temp AS
$$ SELECT id FROM hms.tenant WHERE code = p_code AND status <> 'TERMINATED' $$;

REVOKE ALL ON FUNCTION hms.tenant_id_for_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hms.tenant_id_for_login(text) TO hms_app;

-- The shared-account guard has nothing left to guard: an account now has one hospital.
DROP FUNCTION hms.user_belongs_elsewhere(uuid);
DROP POLICY membership_guard_read ON hms.membership;
