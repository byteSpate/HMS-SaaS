-- =====================================================================================
-- DRAFT VALIDATION PROBES for draft-core-schema.sql — synthetic data only
-- Run on a SCRATCH database as a superuser session that SET ROLEs into hms_app.
-- Each probe prints "PASS Pnn …" or aborts with "FAIL Pnn …".
-- These are design probes, not the project's automated test suite (see docs/H-automated-test-plan.md).
-- =====================================================================================
\set ON_ERROR_STOP on
SET search_path = hms;
SET ROLE hms_app;

-- ------------------------------------------------------------------ synthetic setup (one hospital)
INSERT INTO user_account (id, username, display_name, password_hash) VALUES
 ('00000000-0000-7000-8000-0000000000f1', 'staff.a', 'Staff A (synthetic)', 'argon2id$placeholder');

BEGIN;
INSERT INTO hospital (code, name_en) VALUES ('ALPHA', 'Alpha Hospital');
INSERT INTO facility (id, code, name_en) VALUES ('00000000-0000-7000-8000-0000000000a1', 'MAIN', 'Alpha Main');
INSERT INTO membership (id, user_id) VALUES ('00000000-0000-7000-8000-0000000000a9', '00000000-0000-7000-8000-0000000000f1');
INSERT INTO practitioner (id, name_en, degrees) VALUES ('00000000-0000-7000-8000-0000000000a2', 'Dr. Hasan (synthetic)', 'MBBS');
INSERT INTO patient (id, mrn, name_en, sex, created_by, phone_normalized) VALUES
 ('00000000-0000-7000-8000-0000000000a3', 'MRN-000123', 'Rahim Uddin', 'MALE', '00000000-0000-7000-8000-0000000000f1', '01700000001'),
 ('00000000-0000-7000-8000-0000000000a4', 'MRN-000124', 'Salma Begum', 'FEMALE', '00000000-0000-7000-8000-0000000000f1', '01700000002');
INSERT INTO visit (id, facility_id, patient_id, kind, attending_practitioner_id, created_by) VALUES
 ('00000000-0000-7000-8000-0000000000a5', '00000000-0000-7000-8000-0000000000a1', '00000000-0000-7000-8000-0000000000a3', 'OPD_CONSULTATION', '00000000-0000-7000-8000-0000000000a2', '00000000-0000-7000-8000-0000000000f1');
INSERT INTO service_item (id, code, name_en, category) VALUES
 ('00000000-0000-7000-8000-0000000000b1', 'CBC', 'Complete blood count', 'LAB');
INSERT INTO price_list_version (id, version_no, effective_from, status) VALUES
 ('00000000-0000-7000-8000-0000000000b2', 1, '2026-10-01', 'PUBLISHED');
INSERT INTO price_list_item (price_list_version_id, service_item_id, unit_price) VALUES
 ('00000000-0000-7000-8000-0000000000b2', '00000000-0000-7000-8000-0000000000b1', 300.00);
INSERT INTO invoice (id, number, type, patient_id, visit_id) VALUES
 ('00000000-0000-7000-8000-0000000000b3', 'SI-2026-000001', 'SERVICE', '00000000-0000-7000-8000-0000000000a3', '00000000-0000-7000-8000-0000000000a5');
INSERT INTO charge (id, patient_id, service_item_id, source_module, source_type, source_id, source_event, quantity, unit_price, amount, price_list_version_id, service_time, posted_by) VALUES
 ('00000000-0000-7000-8000-0000000000b4', '00000000-0000-7000-8000-0000000000a3', '00000000-0000-7000-8000-0000000000b1', 'clinical', 'service_order', 'SO-1', 'ORDERED', 1, 300.00, 300.00, '00000000-0000-7000-8000-0000000000b2', now(), '00000000-0000-7000-8000-0000000000f1');
INSERT INTO invoice_line (id, invoice_id, charge_id, line_no, category, net_amount) VALUES
 ('00000000-0000-7000-8000-0000000000b5', '00000000-0000-7000-8000-0000000000b3', '00000000-0000-7000-8000-0000000000b4', 1, 'NON_MEDICINE', 300.00);
INSERT INTO cashier_session (id, facility_id, cashier_user_id) VALUES
 ('00000000-0000-7000-8000-0000000000b6', '00000000-0000-7000-8000-0000000000a1', '00000000-0000-7000-8000-0000000000f1');
INSERT INTO payment (id, invoice_id, cashier_session_id, method, provider_label, amount, receipt_number, recorded_by) VALUES
 ('00000000-0000-7000-8000-0000000000b7', '00000000-0000-7000-8000-0000000000b3', '00000000-0000-7000-8000-0000000000b6', 'MOBILE', 'bKash', 300.00, 'RCPT-2026-000001', '00000000-0000-7000-8000-0000000000f1');
INSERT INTO payment_allocation (payment_id, invoice_id, invoice_line_id, amount) VALUES
 ('00000000-0000-7000-8000-0000000000b7', '00000000-0000-7000-8000-0000000000b3', '00000000-0000-7000-8000-0000000000b5', 300.00);
UPDATE invoice_line SET allocated_amount = 300.00, eligibility = 'ELIGIBLE' WHERE id = '00000000-0000-7000-8000-0000000000b5';
INSERT INTO bed (id, facility_id, ward_code, bed_code) VALUES
 ('00000000-0000-7000-8000-0000000000c1', '00000000-0000-7000-8000-0000000000a1', 'W3', 'W3-07'),
 ('00000000-0000-7000-8000-0000000000c2', '00000000-0000-7000-8000-0000000000a1', 'W4', 'W4-02'),
 ('00000000-0000-7000-8000-0000000000c3', '00000000-0000-7000-8000-0000000000a1', 'W4', 'W4-03');
INSERT INTO admission (id, admission_number, patient_id, route, admitting_practitioner_id) VALUES
 ('00000000-0000-7000-8000-0000000000c4', 'ADM-000001', '00000000-0000-7000-8000-0000000000a3', 'PLANNED', '00000000-0000-7000-8000-0000000000a2'),
 ('00000000-0000-7000-8000-0000000000c5', 'ADM-000002', '00000000-0000-7000-8000-0000000000a4', 'PLANNED', '00000000-0000-7000-8000-0000000000a2');
INSERT INTO bed_occupancy (admission_id, bed_id, period, created_by) VALUES
 ('00000000-0000-7000-8000-0000000000c4', '00000000-0000-7000-8000-0000000000c1', tstzrange('2026-11-02 10:00+06', NULL, '[)'), '00000000-0000-7000-8000-0000000000f1');
INSERT INTO audit_event (action, outcome, target_type, target_id) VALUES
 ('billing.payment.recorded', 'SUCCEEDED', 'payment', '00000000-0000-7000-8000-0000000000b7');
INSERT INTO outbox_event (event_type, aggregate_type, aggregate_id, payload) VALUES
 ('billing.PaymentRecorded', 'payment', '00000000-0000-7000-8000-0000000000b7', '{}');
INSERT INTO schedule_session (id, practitioner_id, facility_id, session_date, starts_at, ends_at, capacity) VALUES
 ('00000000-0000-7000-8000-0000000000d1', '00000000-0000-7000-8000-0000000000a2', '00000000-0000-7000-8000-0000000000a1', '2026-11-03', '2026-11-03 09:00+06', '2026-11-03 12:00+06', 1);
INSERT INTO store (id, facility_id, code) VALUES ('00000000-0000-7000-8000-0000000000e1', '00000000-0000-7000-8000-0000000000a1', 'PHARM');
INSERT INTO stock_item (id, code, kind, base_unit) VALUES ('00000000-0000-7000-8000-0000000000e2', 'PCM500', 'MEDICINE', 'tablet');
INSERT INTO stock_batch (id, stock_item_id, lot_no, expiry_date) VALUES ('00000000-0000-7000-8000-0000000000e3', '00000000-0000-7000-8000-0000000000e2', 'LOT-1', '2027-12-31');
INSERT INTO stock_balance (store_id, batch_id, on_hand) VALUES ('00000000-0000-7000-8000-0000000000e1', '00000000-0000-7000-8000-0000000000e3', 5);
COMMIT;

\echo 'setup complete'

-- ------------------------------------------------------------------ probes
DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN
    INSERT INTO patient (mrn, name_en, sex, created_by)
    VALUES ('MRN-000123', 'Dup', 'MALE', '00000000-0000-7000-8000-0000000000f1');
  EXCEPTION WHEN unique_violation THEN ok := true; RAISE NOTICE 'PASS P01 MRN unique';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P01'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN  -- second admission tries bed W3-07 while ADM-000001 occupies it
    INSERT INTO bed_occupancy (admission_id, bed_id, period, created_by)
    VALUES ('00000000-0000-7000-8000-0000000000c5', '00000000-0000-7000-8000-0000000000c1',
            tstzrange('2026-11-02 12:00+06', NULL, '[)'), '00000000-0000-7000-8000-0000000000f1');
  EXCEPTION WHEN exclusion_violation THEN ok := true; RAISE NOTICE 'PASS P02 double allocation of a bed rejected (exclusion constraint)';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P02'; END IF;
END $$;

DO $$ DECLARE n int; BEGIN  -- transfer: close [10:00, 15:30) and open W4-02 at 15:30; then ADM-2 takes W3-07 at 15:30
  UPDATE bed_occupancy SET period = tstzrange(lower(period), '2026-11-03 15:30+06', '[)')
   WHERE admission_id = '00000000-0000-7000-8000-0000000000c4' AND upper(period) IS NULL;
  INSERT INTO bed_occupancy (admission_id, bed_id, period, created_by) VALUES
   ('00000000-0000-7000-8000-0000000000c4', '00000000-0000-7000-8000-0000000000c2', tstzrange('2026-11-03 15:30+06', NULL, '[)'), '00000000-0000-7000-8000-0000000000f1'),
   ('00000000-0000-7000-8000-0000000000c5', '00000000-0000-7000-8000-0000000000c1', tstzrange('2026-11-03 15:30+06', NULL, '[)'), '00000000-0000-7000-8000-0000000000f1');
  SELECT count(*) INTO n FROM bed_occupancy;
  IF n = 3 THEN RAISE NOTICE 'PASS P03 transfer at the same instant is accepted (half-open intervals) and history kept';
  ELSE RAISE EXCEPTION 'FAIL P03 n=%', n; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN  -- ADM-1 already has a PRIMARY bed from 15:30; a second overlapping PRIMARY occupancy must fail
    INSERT INTO bed_occupancy (admission_id, bed_id, period, created_by) VALUES
     ('00000000-0000-7000-8000-0000000000c4', '00000000-0000-7000-8000-0000000000c3', tstzrange('2026-11-04 08:00+06', NULL, '[)'), '00000000-0000-7000-8000-0000000000f1');
  EXCEPTION WHEN exclusion_violation THEN ok := true; RAISE NOTICE 'PASS P04 one primary bed per admission at a time';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P04'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN
    INSERT INTO charge (patient_id, service_item_id, source_module, source_type, source_id, source_event, quantity, unit_price, amount, price_list_version_id, service_time, posted_by) VALUES
     ('00000000-0000-7000-8000-0000000000a3', '00000000-0000-7000-8000-0000000000b1', 'clinical', 'service_order', 'SO-1', 'ORDERED', 1, 300.00, 300.00, '00000000-0000-7000-8000-0000000000b2', now(), '00000000-0000-7000-8000-0000000000f1');
  EXCEPTION WHEN unique_violation THEN ok := true; RAISE NOTICE 'PASS P05 duplicate source posting reference rejected (FPR-09)';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P05'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN
    UPDATE invoice_line SET allocated_amount = 300.01 WHERE id = '00000000-0000-7000-8000-0000000000b5';
  EXCEPTION WHEN check_violation THEN ok := true; RAISE NOTICE 'PASS P06 over-allocation of a line rejected';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P06'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN
    UPDATE payment SET method = 'CASH' WHERE id = '00000000-0000-7000-8000-0000000000b7';
  EXCEPTION WHEN insufficient_privilege THEN ok := true; RAISE NOTICE 'PASS P07 payment is append-only for hms_app';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P07'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN
    UPDATE invoice_line SET net_amount = 1.00 WHERE id = '00000000-0000-7000-8000-0000000000b5';
  EXCEPTION WHEN insufficient_privilege THEN ok := true; RAISE NOTICE 'PASS P08 posted line amount cannot be edited (column grant)';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P08'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  UPDATE schedule_session SET booked_count = booked_count + 1 WHERE id = '00000000-0000-7000-8000-0000000000d1';
  BEGIN
    UPDATE schedule_session SET booked_count = booked_count + 1 WHERE id = '00000000-0000-7000-8000-0000000000d1';
  EXCEPTION WHEN check_violation THEN ok := true; RAISE NOTICE 'PASS P09 session capacity enforced (CAPACITY_FULL)';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P09'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN
    INSERT INTO invoice (number, type, patient_id, visit_id) VALUES
     ('SI-2026-000002', 'SERVICE', '00000000-0000-7000-8000-0000000000a3', '00000000-0000-7000-8000-0000000000a5');
  EXCEPTION WHEN unique_violation THEN ok := true; RAISE NOTICE 'PASS P10 one combined SERVICE invoice per visit (C-008)';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P10'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN
    INSERT INTO price_list_item (price_list_version_id, service_item_id, unit_price) VALUES
     ('00000000-0000-7000-8000-0000000000b2', '00000000-0000-7000-8000-0000000000b1', 350.00);
  EXCEPTION WHEN unique_violation THEN ok := true; RAISE NOTICE 'PASS P11 one price per item per version (UNIQUE NULLS NOT DISTINCT)';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P11'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN
    UPDATE audit_event SET outcome = 'FAILED';
  EXCEPTION WHEN insufficient_privilege THEN ok := true; RAISE NOTICE 'PASS P12 audit_event is append-only for hms_app';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P12'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN
    UPDATE stock_balance SET on_hand = on_hand - 6 WHERE batch_id = '00000000-0000-7000-8000-0000000000e3';
  EXCEPTION WHEN check_violation THEN ok := true; RAISE NOTICE 'PASS P13 stock cannot go negative (INSUFFICIENT_STOCK)';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P13'; END IF;
END $$;

DO $$ DECLARE ok boolean := false; BEGIN
  INSERT INTO stock_movement (store_id, batch_id, quantity, movement_type, source_type, source_id, source_line_id, moved_by) VALUES
   ('00000000-0000-7000-8000-0000000000e1', '00000000-0000-7000-8000-0000000000e3', -2, 'ISSUE', 'dispense', '00000000-0000-7000-8000-0000000000e9', '00000000-0000-7000-8000-0000000000ea', '00000000-0000-7000-8000-0000000000f1');
  BEGIN
    INSERT INTO stock_movement (store_id, batch_id, quantity, movement_type, source_type, source_id, source_line_id, moved_by) VALUES
     ('00000000-0000-7000-8000-0000000000e1', '00000000-0000-7000-8000-0000000000e3', -2, 'ISSUE', 'dispense', '00000000-0000-7000-8000-0000000000e9', '00000000-0000-7000-8000-0000000000ea', '00000000-0000-7000-8000-0000000000f1');
  EXCEPTION WHEN unique_violation THEN ok := true; RAISE NOTICE 'PASS P14 retried dispense line creates one stock movement';
  END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL P14'; END IF;
END $$;

\echo 'all probes finished'
