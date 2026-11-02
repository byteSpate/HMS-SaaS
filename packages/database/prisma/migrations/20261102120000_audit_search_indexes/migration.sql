-- Audit search by action and by time (T-PLT-02; FR-AUD-005; E section 9.5).
CREATE INDEX "audit_event_tenant_id_action_occurred_at_idx" ON hms.audit_event ("tenant_id", "action", "occurred_at");
CREATE INDEX "audit_event_tenant_id_occurred_at_idx" ON hms.audit_event ("tenant_id", "occurred_at");
