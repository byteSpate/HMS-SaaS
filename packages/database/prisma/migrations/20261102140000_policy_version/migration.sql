-- Effective-dated hospital settings (T-PLT-05; FR-CFG-002, FR-SAA-005; P-004; E section 8).
-- Append-only: a change is a new version, so a record that used an older one keeps its meaning.
-- The draft schema's DRAFT and RETIRED states are left out: preview replaces drafts, and a later
-- version replaces a retired one. A state column can be added when a screen needs saved drafts.
CREATE TABLE hms.policy_version (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "policy_key" TEXT NOT NULL,
    "version_no" INTEGER NOT NULL,
    "effective_from" TIMESTAMPTZ NOT NULL,
    "body" JSONB NOT NULL,
    "published_by" UUID,
    "published_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "policy_version_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "policy_version_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "policy_version_tenant_id_policy_key_version_no_key"
  ON hms.policy_version ("tenant_id", "policy_key", "version_no");
CREATE INDEX "policy_version_tenant_id_policy_key_effective_from_idx"
  ON hms.policy_version ("tenant_id", "policy_key", "effective_from");

ALTER TABLE hms.policy_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.policy_version FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.policy_version
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

REVOKE UPDATE ON hms.policy_version FROM hms_app;
