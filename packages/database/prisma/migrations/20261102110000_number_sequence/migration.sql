-- Business number sequences (T-PLT-04; FR-CFG-003; E sections 4 and 8). One row per hospital and
-- sequence, for example MRN or INV-SERVICE-2026.
CREATE TABLE hms.number_sequence (
    "tenant_id" UUID NOT NULL,
    "sequence_key" TEXT NOT NULL,
    "next_value" BIGINT NOT NULL DEFAULT 1,

    CONSTRAINT "number_sequence_pkey" PRIMARY KEY ("tenant_id", "sequence_key"),
    CONSTRAINT "number_sequence_next_value_check" CHECK ("next_value" > 0),
    CONSTRAINT "number_sequence_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE hms.number_sequence ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.number_sequence FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.number_sequence
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

-- No DELETE: removing a row would restart its numbers and create duplicates.
GRANT SELECT, INSERT, UPDATE ON hms.number_sequence TO hms_app;
