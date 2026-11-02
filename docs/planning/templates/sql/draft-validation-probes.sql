-- =====================================================================================
-- DRAFT VALIDATION PROBES for draft-core-schema.sql — synthetic data only
-- Run on a SCRATCH database as a superuser session that SET ROLEs into hms_app etc.
-- Each probe prints "PASS Pnn …" or aborts with "FAIL Pnn …".
-- These are design probes, not the project's automated test suite (see docs/H-automated-test-plan.md).
-- =====================================================================================
\set ON_ERROR_STOP on
SET search_path = hms;
SET ROLE hms_app;

-- ------------------------------------------------------------------ synthetic setup (two tenants)
-- Tenant A = 00000000-0000-7000-8000-00000000000a ("Alpha Hospital", synthetic)
-- Tenant B = 00000000-0000-7000-8000-00000000000b ("Beta Clinic", synthetic)
INSERT INTO user_account (id, username, display_name, password_hash) VALUES
 ('00000000-0000-7000-8000-0000000000f1', 'staff.a', 'Staff A (synthetic)', 'argon2id$placeholder'),
 ('00000000-0000-7000-8000-0000000000f2', 'staff.b', 'Staff B (synthetic)', 'argon2id$placeholder'),
 ('00000000-0000-7000-8000-0000000000f3', 'multi',   'Multi-tenant user',   'argon2id$placeholder');

BEGIN;
SELECT set_config('app.tenant_id', '00000000-0000-7000-8000-00000000000a', true);
INSERT INTO tenant (id, code, name_en) VALUES ('00000000-0000-7000-8000-00000000000a', 'alpha', 'Alpha Hospital');
INSERT INTO facility (tenant_id, id, code, name_en) VALUES ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000a1', 'MAIN', 'Alpha Main');
INSERT INTO membership (tenant_id, id, user_id) VALUES
 ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000a9', '00000000-0000-7000-8000-0000000000f1'),
 ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000a8', '00000000-0000-7000-8000-0000000000f3');
INSERT INTO practitioner (tenant_id, id, name_en, degrees) VALUES ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000a2', 'Dr. Hasan (synthetic)', 'MBBS');
INSERT INTO patient (tenant_id, id, mrn, name_en, sex, created_by, phone_normalized) VALUES
 ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000a3', 'MRN-000123', 'Rahim Uddin', 'MALE', '00000000-0000-7000-8000-0000000000f1', '01700000001'),
 ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000a4', 'MRN-000124', 'Salma Begum', 'FEMALE', '00000000-0000-7000-8000-0000000000f1', '01700000002');
INSERT INTO visit (tenant_id, id, facility_id, patient_id, kind, attending_practitioner_id, created_by) VALUES
 ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000a5', '00000000-0000-7000-8000-0000000000a1', '00000000-0000-7000-8000-0000000000a3', 'OPD_CONSULTATION', '00000000-0000-7000-8000-0000000000a2', '00000000-0000-7000-8000-0000000000f1');
INSERT INTO service_item (tenant_id, id, code, name_en, category) VALUES
 ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000b1', 'CBC', 'Complete blood count', 'LAB');
INSERT INTO price_list_version (tenant_id, id, version_no, effective_from, status) VALUES
 ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000b2', 1, '2026-10-01', 'PUBLISHED');
INSERT INTO price_list_item (tenant_id, price_list_version_id, service_item_id, unit_price) VALUES
 ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000b2', '00000000-0000-7000-8000-0000000000b1', 300.00);
INSERT INTO invoice (tenant_id, id, number, type, patient_id, visit_id) VALUES
 ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000b3', 'SI-2026-000001', 'SERVICE', '00000000-0000-7000-8000-0000000000a3', '00000000-0000-7000-8000-0000000000a5');
INSERT INTO charge (tenant_id, id, patient_id, service_item_id, source_module, source_type, source_id, source_event, quantity, unit_price, amount, price_list_version_id, service_time, posted_by) VALUES
 ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000b4', '00000000-0000-7000-8000-0000000000a3', '00000000-0000-7000-8000-0000000000b1', 'clinical', 'service_order', 'SO-1', 'ORDERED', 1, 300.00, 300.00, '00000000-0000-7000-8000-0000000000b2', now(), '00000000-0000-7000-8000-0000000000f1');
INSERT INTO invoice_line (tenant_id, id, invoice_id, charge_id, line_no, category, net_amount) VALUES
 ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000b5', '00000000-0000-7000-8000-0000000000b3', '00000000-0000-7000-8000-0000000000b4', 1, 'NON_MEDICINE', 300.00);
INSERT INTO cashier_session (tenant_id, id, facility_id, cashier_user_id) VALUES
 ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000b6', '00000000-0000-7000-8000-0000000000a1', '00000000-0000-7000-8000-0000000000f1');
INSERT INTO payment (tenant_id, id, invoice_id, cashier_session_id, method, provider_label, amount, receipt_number, recorded_by) VALUES
 ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000b7', '00000000-0000-7000-8000-0000000000b3', '00000000-0000-7000-8000-0000000000b6', 'MOBILE', 'bKash', 300.00, 'RCPT-2026-000001', '00000000-0000-7000-8000-0000000000f1');
INSERT INTO payment_allocation (tenant_id, payment_id, invoice_id, invoice_line_id, amount) VALUES
 ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000b7', '00000000-0000-7000-8000-0000000000b3', '00000000-0000-7000-8000-0000000000b5', 300.00);
UPDATE invoice_line SET allocated_amount = 300.00, eligibility = 'ELIGIBLE' WHERE id = '00000000-0000-7000-8000-0000000000b5';
INSERT INTO bed (tenant_id, id, facility_id, ward_code, bed_code) VALUES
 ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000c1', '00000000-0000-7000-8000-0000000000a1', 'W3', 'W3-07'),
 ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000c2', '00000000-0000-7000-8000-0000000000a1', 'W4', 'W4-02'),
 ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000c3', '00000000-0000-7000-8000-0000000000a1', 'W4', 'W4-03');
INSERT INTO admission (tenant_id, id, admission_number, patient_id, route, admitting_practitioner_id) VALUES
 ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000c4', 'ADM-000001', '00000000-0000-7000-8000-0000000000a3', 'PLANNED', '00000000-0000-7000-8000-0000000000a2'),
 ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000c5', 'ADM-000002', '00000000-0000-7000-8000-0000000000a4', 'PLANNED', '00000000-0000-7000-8000-0000000000a2');
INSERT INTO bed_occupancy (tenant_id, admission_id, bed_id, period, created_by) VALUES
 ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000c4', '00000000-0000-7000-8000-0000000000c1', tstzrange('2026-11-02 10:00+06', NULL, '[)'), '00000000-0000-7000-8000-0000000000f1');
INSERT INTO audit_event (tenant_id, action, outcome, target_type, target_id) VALUES
 ('00000000-0000-7000-8000-00000000000a', 'billing.payment.recorded', 'SUCCEEDED', 'payment', '00000000-0000-7000-8000-0000000000b7');
INSERT INTO outbox_event (tenant_id, event_type, aggregate_type, aggregate_id, payload) VALUES
 ('00000000-0000-7000-8000-00000000000a', 'billing.PaymentRecorded', 'payment', '00000000-0000-7000-8000-0000000000b7', '{}');
INSERT INTO schedule_session (tenant_id, id, practitioner_id, facility_id, session_date, starts_at, ends_at, capacity) VALUES
 ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000d1', '00000000-0000-7000-8000-0000000000a2', '00000000-0000-7000-8000-0000000000a1', '2026-11-03', '2026-11-03 09:00+06', '2026-11-03 12:00+06', 1);
INSERT INTO store (tenant_id, id, facility_id, code) VALUES ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000e1', '00000000-0000-7000-8000-0000000000a1', 'PHARM');
INSERT INTO stock_item (tenant_id, id, code, kind, base_unit) VALUES ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000e2', 'PCM500', 'MEDICINE', 'tablet');
INSERT INTO stock_batch (tenant_id, id, stock_item_id, lot_no, expiry_date) VALUES ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000e3', '00000000-0000-7000-8000-0000000000e2', 'LOT-1', '2027-12-31');
INSERT INTO stock_balance (tenant_id, store_id, batch_id, on_hand) VALUES ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000e1', '00000000-0000-7000-8000-0000000000e3', 5);
COMMIT;

BEGIN;
SELECT set_config('app.tenant_id', '00000000-0000-7000-8000-00000000000b', true);
INSERT INTO tenant (id, code, name_en) VALUES ('00000000-0000-7000-8000-00000000000b', 'beta', 'Beta Clinic');
INSERT INTO facility (tenant_id, id, code, name_en) VALUES ('00000000-0000-7000-8000-00000000000b', '00000000-0000-7000-8000-0000000000b9', 'MAIN', 'Beta Main');
INSERT INTO membership (tenant_id, id, user_id) VALUES
 ('00000000-0000-7000-8000-00000000000b', '00000000-0000-7000-8000-0000000000ba', '00000000-0000-7000-8000-0000000000f2'),
 ('00000000-0000-7000-8000-00000000000b', '00000000-0000-7000-8000-0000000000bb', '00000000-0000-7000-8000-0000000000f3');
-- Same MRN as tenant A: allowed (FR-SAA-001)
INSERT INTO patient (tenant_id, id, mrn, name_en, sex, created_by) VALUES
 ('00000000-0000-7000-8000-00000000000b', '00000000-0000-7000-8000-0000000000bc', 'MRN-000123', 'Different Person', 'FEMALE', '00000000-0000-7000-8000-0000000000f2');
COMMIT;
\echo 'setup complete'

-- ------------------------------------------------------------------ probes
DO $$ DECLARE n int; m text; BEGIN
  PERFORM set_config('app.tenant_id', '00000000-0000-7000-8000-00000000000a', true);
  SELECT count(*), max(name_en) INTO n, m FROM patient WHERE mrn = 'MRN-000123';
  IF n = 1 AND m = 'Rahim Uddin' THEN RAISE NOTICE 'PASS P01 tenant A sees only its own MRN-000123';
  ELSE RAISE EXCEPTION 'FAIL P01 n=% m=%', n, m; END IF;
END $$;

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM patient;   -- no tenant context set in this transaction
  IF n = 0 THEN RAISE NOTICE 'PASS P02 no tenant context -> zero rows (fail-closed)';
  ELSE RAISE EXCEPTION 'FAIL P02 saw % rows without context', n; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN
    INSERT INTO patient (tenant_id, mrn, name_en, sex, created_by)
    VALUES ('00000000-0000-7000-8000-00000000000a', 'MRN-X', 'No Context', 'MALE', '00000000-0000-7000-8000-0000000000f1');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; RAISE NOTICE 'PASS P03 insert without context rejected (%)', SQLERRM;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P03'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  PERFORM set_config('app.tenant_id', '00000000-0000-7000-8000-00000000000a', true);
  BEGIN
    INSERT INTO patient (tenant_id, mrn, name_en, sex, created_by)
    VALUES ('00000000-0000-7000-8000-00000000000b', 'MRN-Y', 'Wrong Tenant', 'MALE', '00000000-0000-7000-8000-0000000000f1');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; RAISE NOTICE 'PASS P04 writing another tenant''s row rejected by WITH CHECK';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P04'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  PERFORM set_config('app.tenant_id', '00000000-0000-7000-8000-00000000000a', true);
  BEGIN  -- tenant A visit pointing at tenant B's patient id
    INSERT INTO visit (tenant_id, facility_id, patient_id, kind, created_by)
    VALUES ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000a1', '00000000-0000-7000-8000-0000000000bc', 'DIAGNOSTIC', '00000000-0000-7000-8000-0000000000f1');
  EXCEPTION WHEN foreign_key_violation THEN ok := true; RAISE NOTICE 'PASS P05 composite FK blocks cross-tenant parent reference';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P05'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  PERFORM set_config('app.tenant_id', '00000000-0000-7000-8000-00000000000a', true);
  BEGIN
    INSERT INTO patient (tenant_id, mrn, name_en, sex, created_by)
    VALUES ('00000000-0000-7000-8000-00000000000a', 'MRN-000123', 'Dup', 'MALE', '00000000-0000-7000-8000-0000000000f1');
  EXCEPTION WHEN unique_violation THEN ok := true; RAISE NOTICE 'PASS P06 MRN unique within tenant';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P06'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  PERFORM set_config('app.tenant_id', '00000000-0000-7000-8000-00000000000a', true);
  BEGIN  -- second admission tries bed W3-07 while ADM-000001 occupies it
    INSERT INTO bed_occupancy (tenant_id, admission_id, bed_id, period, created_by)
    VALUES ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000c5', '00000000-0000-7000-8000-0000000000c1',
            tstzrange('2026-11-02 12:00+06', NULL, '[)'), '00000000-0000-7000-8000-0000000000f1');
  EXCEPTION WHEN exclusion_violation THEN ok := true; RAISE NOTICE 'PASS P07 double allocation of a bed rejected (exclusion constraint)';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P07'; END IF;
END $$;

DO $$ DECLARE n int; BEGIN  -- transfer: close [10:00, 15:30) and open W4-02 at 15:30; then ADM-2 takes W3-07 at 15:30
  PERFORM set_config('app.tenant_id', '00000000-0000-7000-8000-00000000000a', true);
  UPDATE bed_occupancy SET period = tstzrange(lower(period), '2026-11-03 15:30+06', '[)')
   WHERE admission_id = '00000000-0000-7000-8000-0000000000c4' AND upper(period) IS NULL;
  INSERT INTO bed_occupancy (tenant_id, admission_id, bed_id, period, created_by) VALUES
   ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000c4', '00000000-0000-7000-8000-0000000000c2', tstzrange('2026-11-03 15:30+06', NULL, '[)'), '00000000-0000-7000-8000-0000000000f1'),
   ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000c5', '00000000-0000-7000-8000-0000000000c1', tstzrange('2026-11-03 15:30+06', NULL, '[)'), '00000000-0000-7000-8000-0000000000f1');
  SELECT count(*) INTO n FROM bed_occupancy;
  IF n = 3 THEN RAISE NOTICE 'PASS P08 transfer at the same instant is accepted (half-open intervals) and history kept';
  ELSE RAISE EXCEPTION 'FAIL P08 n=%', n; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  PERFORM set_config('app.tenant_id', '00000000-0000-7000-8000-00000000000a', true);
  BEGIN  -- ADM-1 already has a PRIMARY bed from 15:30; a second overlapping PRIMARY occupancy must fail
    INSERT INTO bed_occupancy (tenant_id, admission_id, bed_id, period, created_by) VALUES
     ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000c4', '00000000-0000-7000-8000-0000000000c3', tstzrange('2026-11-04 08:00+06', NULL, '[)'), '00000000-0000-7000-8000-0000000000f1');
  EXCEPTION WHEN exclusion_violation THEN ok := true; RAISE NOTICE 'PASS P09 one primary bed per admission at a time';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P09'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  PERFORM set_config('app.tenant_id', '00000000-0000-7000-8000-00000000000a', true);
  BEGIN
    INSERT INTO charge (tenant_id, patient_id, service_item_id, source_module, source_type, source_id, source_event, quantity, unit_price, amount, price_list_version_id, service_time, posted_by) VALUES
     ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000a3', '00000000-0000-7000-8000-0000000000b1', 'clinical', 'service_order', 'SO-1', 'ORDERED', 1, 300.00, 300.00, '00000000-0000-7000-8000-0000000000b2', now(), '00000000-0000-7000-8000-0000000000f1');
  EXCEPTION WHEN unique_violation THEN ok := true; RAISE NOTICE 'PASS P10 duplicate source posting reference rejected (FPR-09)';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P10'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  PERFORM set_config('app.tenant_id', '00000000-0000-7000-8000-00000000000a', true);
  BEGIN
    UPDATE invoice_line SET allocated_amount = 300.01 WHERE id = '00000000-0000-7000-8000-0000000000b5';
  EXCEPTION WHEN check_violation THEN ok := true; RAISE NOTICE 'PASS P11 over-allocation of a line rejected';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P11'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  PERFORM set_config('app.tenant_id', '00000000-0000-7000-8000-00000000000a', true);
  BEGIN
    UPDATE payment SET method = 'CASH' WHERE id = '00000000-0000-7000-8000-0000000000b7';
  EXCEPTION WHEN insufficient_privilege THEN ok := true; RAISE NOTICE 'PASS P12 payment is append-only for hms_app';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P12'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  PERFORM set_config('app.tenant_id', '00000000-0000-7000-8000-00000000000a', true);
  BEGIN
    UPDATE invoice_line SET net_amount = 1.00 WHERE id = '00000000-0000-7000-8000-0000000000b5';
  EXCEPTION WHEN insufficient_privilege THEN ok := true; RAISE NOTICE 'PASS P13 posted line amount cannot be edited (column grant)';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P13'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  PERFORM set_config('app.tenant_id', '00000000-0000-7000-8000-00000000000a', true);
  UPDATE schedule_session SET booked_count = booked_count + 1 WHERE id = '00000000-0000-7000-8000-0000000000d1';
  BEGIN
    UPDATE schedule_session SET booked_count = booked_count + 1 WHERE id = '00000000-0000-7000-8000-0000000000d1';
  EXCEPTION WHEN check_violation THEN ok := true; RAISE NOTICE 'PASS P14 session capacity enforced (CAPACITY_FULL)';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P14'; END IF;
END $$;

BEGIN;
SELECT set_config('app.tenant_id', '00000000-0000-7000-8000-00000000000a', true);
SELECT count(*) AS rows_inside_tx FROM patient;
COMMIT;
DO $$ DECLARE n int; s text; BEGIN
  s := current_setting('app.tenant_id', true);
  SELECT count(*) INTO n FROM patient;
  IF n = 0 THEN RAISE NOTICE 'PASS P15 transaction-local context cleared after COMMIT (setting now %, rows %)', quote_literal(s), n;
  ELSE RAISE EXCEPTION 'FAIL P15 context leaked: % rows', n; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  PERFORM set_config('row_security', 'off', true);
  PERFORM set_config('app.tenant_id', '00000000-0000-7000-8000-00000000000a', true);
  BEGIN
    PERFORM count(*) FROM patient;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; RAISE NOTICE 'PASS P16 row_security=off cannot bypass RLS for hms_app (%)', SQLERRM;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P16'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  PERFORM set_config('app.tenant_id', '00000000-0000-7000-8000-00000000000a', true);
  BEGIN
    INSERT INTO invoice (tenant_id, number, type, patient_id, visit_id) VALUES
     ('00000000-0000-7000-8000-00000000000a', 'SI-2026-000002', 'SERVICE', '00000000-0000-7000-8000-0000000000a3', '00000000-0000-7000-8000-0000000000a5');
  EXCEPTION WHEN unique_violation THEN ok := true; RAISE NOTICE 'PASS P17 one combined SERVICE invoice per visit (C-008)';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P17'; END IF;
END $$;

DO $$ DECLARE n int; BEGIN  -- login-time listing: user context only, no tenant chosen yet
  PERFORM set_config('app.user_id', '00000000-0000-7000-8000-0000000000f3', true);
  SELECT count(*) INTO n FROM membership;
  IF n = 2 THEN RAISE NOTICE 'PASS P18 user sees own memberships in both tenants before choosing one';
  ELSE RAISE EXCEPTION 'FAIL P18 n=%', n; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  PERFORM set_config('app.tenant_id', '00000000-0000-7000-8000-00000000000a', true);
  BEGIN
    INSERT INTO price_list_item (tenant_id, price_list_version_id, service_item_id, unit_price) VALUES
     ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000b2', '00000000-0000-7000-8000-0000000000b1', 350.00);
  EXCEPTION WHEN unique_violation THEN ok := true; RAISE NOTICE 'PASS P19 one price per item per version (UNIQUE NULLS NOT DISTINCT)';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P19'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  PERFORM set_config('app.tenant_id', '00000000-0000-7000-8000-00000000000a', true);
  BEGIN
    UPDATE audit_event SET outcome = 'FAILED';
  EXCEPTION WHEN insufficient_privilege THEN ok := true; RAISE NOTICE 'PASS P20 audit_event is append-only for hms_app';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P20'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  PERFORM set_config('app.tenant_id', '00000000-0000-7000-8000-00000000000a', true);
  BEGIN
    UPDATE stock_balance SET on_hand = on_hand - 6 WHERE batch_id = '00000000-0000-7000-8000-0000000000e3';
  EXCEPTION WHEN check_violation THEN ok := true; RAISE NOTICE 'PASS P21 stock cannot go negative (INSUFFICIENT_STOCK)';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P21'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  PERFORM set_config('app.tenant_id', '00000000-0000-7000-8000-00000000000a', true);
  INSERT INTO stock_movement (tenant_id, store_id, batch_id, quantity, movement_type, source_type, source_id, source_line_id, moved_by) VALUES
   ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000e1', '00000000-0000-7000-8000-0000000000e3', -2, 'ISSUE', 'dispense', '00000000-0000-7000-8000-0000000000e9', '00000000-0000-7000-8000-0000000000ea', '00000000-0000-7000-8000-0000000000f1');
  BEGIN
    INSERT INTO stock_movement (tenant_id, store_id, batch_id, quantity, movement_type, source_type, source_id, source_line_id, moved_by) VALUES
     ('00000000-0000-7000-8000-00000000000a', '00000000-0000-7000-8000-0000000000e1', '00000000-0000-7000-8000-0000000000e3', -2, 'ISSUE', 'dispense', '00000000-0000-7000-8000-0000000000e9', '00000000-0000-7000-8000-0000000000ea', '00000000-0000-7000-8000-0000000000f1');
  EXCEPTION WHEN unique_violation THEN ok := true; RAISE NOTICE 'PASS P22 retried dispense line creates one stock movement';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P22'; END IF;
END $$;

RESET ROLE;
SET ROLE hms_relay;
DO $$ DECLARE n int; ok boolean := false; BEGIN
  SELECT count(*) INTO n FROM hms.outbox_event WHERE published_at IS NULL;   -- no tenant context needed
  BEGIN
    PERFORM count(*) FROM hms.patient;
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  IF n = 1 AND ok THEN RAISE NOTICE 'PASS P23 relay reads outbox across tenants but has no access to patient data';
  ELSE RAISE EXCEPTION 'FAIL P23 n=% ok=%', n, ok; END IF;
END $$;
RESET ROLE;

SET ROLE hms_control;
DO $$ DECLARE n int; ok boolean := false; BEGIN
  SELECT count(*) INTO n FROM hms.tenant;
  BEGIN
    PERFORM count(*) FROM hms.patient;
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  IF n = 2 AND ok THEN RAISE NOTICE 'PASS P24 control plane lists tenants but cannot read patients';
  ELSE RAISE EXCEPTION 'FAIL P24 n=% ok=%', n, ok; END IF;
END $$;
RESET ROLE;

SELECT 'uuidv7 sample' AS probe, uuidv7() AS value;
\echo 'all probes finished'
