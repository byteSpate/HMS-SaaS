-- A practitioner's department (T-PRA-02 part 2; FR-PRA-001). Optional: a visiting consultant may
-- belong to none. The composite foreign key keeps it inside the practitioner's hospital
-- (ADR-003, E section 6); a null department_id is not checked (MATCH SIMPLE).

ALTER TABLE hms.practitioner
  ADD COLUMN "department_id" UUID,
  ADD CONSTRAINT "practitioner_tenant_id_department_id_fkey" FOREIGN KEY ("tenant_id", "department_id")
    REFERENCES hms.department ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Lists of a department's doctors (reception pickers, T-SCH-01).
CREATE INDEX "practitioner_tenant_id_department_id_idx"
  ON hms.practitioner ("tenant_id", "department_id");

GRANT UPDATE (department_id) ON hms.practitioner TO hms_app;
