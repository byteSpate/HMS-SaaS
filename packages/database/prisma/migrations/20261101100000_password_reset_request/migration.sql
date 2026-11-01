-- Signed-out request for a new password, shown to the hospital administrator (C-093, FR-ACC-012).
-- One nullable column: repeating a request changes nothing, so it cannot fill a table.
ALTER TABLE hms.user_account ADD COLUMN password_reset_requested_at TIMESTAMPTZ;

-- Named explicitly because the identity tables move to column-level UPDATE grants (T-FND-04).
GRANT UPDATE (password_reset_requested_at) ON hms.user_account TO hms_app;
