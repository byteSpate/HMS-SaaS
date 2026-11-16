-- A practitioner's staff account (T-CLI-01; FR-PRA-003; owner decision 2026-11-16: the
-- administrator links it on the practitioner form). Optional: a visiting consultant may have no
-- account. The link only tells the doctor's worklist whose sessions to show; it grants no
-- permission, the account's roles do. The composite foreign key to the membership keeps the
-- account inside the practitioner's hospital (ADR-003); a null user_id is not checked.

ALTER TABLE hms.practitioner
  ADD COLUMN "user_id" UUID,
  ADD CONSTRAINT "practitioner_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id")
    REFERENCES hms.membership ("tenant_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FR-PRA-003: one account per practitioner and one practitioner per account, in a hospital.
CREATE UNIQUE INDEX "practitioner_tenant_id_user_id_key"
  ON hms.practitioner ("tenant_id", "user_id") WHERE "user_id" IS NOT NULL;

GRANT UPDATE (user_id) ON hms.practitioner TO hms_app;
