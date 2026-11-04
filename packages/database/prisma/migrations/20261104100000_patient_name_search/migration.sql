-- Fast patient name search under RLS (T-PAT-02; NFR-PERF-001; ADR-003; owner decision 2026-11-04).
-- pg_trgm's operators are not leakproof, so PostgreSQL never uses them as index conditions on a
-- table with row-level security: as hms_app a name search scanned all 600,000 rows (3 to 7 s).
-- As in the shared-account guard (20261102090000), one SECURITY DEFINER function runs as its owner,
-- hms_migrator, which a read-only policy lets see the rows; the function filters on the session's
-- own hospital itself. It never takes a hospital as a parameter, so hms_app cannot ask for another.

-- GiST instead of GIN: it supports nearest-first ordering (<<->), so a common name reads 20 rows,
-- not every match. Both support % and LIKE for duplicate matching.
DROP INDEX hms.patient_name_en_trgm_idx;
DROP INDEX hms.patient_name_bn_trgm_idx;
CREATE INDEX "patient_name_en_trgm_idx" ON hms.patient USING gist ("name_en" hms.gist_trgm_ops);
CREATE INDEX "patient_name_bn_trgm_idx" ON hms.patient USING gist ("name_bn" hms.gist_trgm_ops);

-- Read-only and limited to the migrator role: hms_app still sees only its hospital's rows.
CREATE POLICY patient_search_read ON hms.patient FOR SELECT TO hms_migrator USING (true);

-- Up to 20 patients of the CURRENT hospital whose name contains a word similar to p_name (word
-- similarity at least 0.4, tuned in the T-PAT-02 log), closest first. A term with Bangla letters
-- (U+0980..U+09FF) is compared with name_bn, any other with name_en: across scripts the similarity
-- is always 0, and skipping that half halves the work. With no hospital in the session,
-- hms.current_tenant_id() is null and nothing matches.
CREATE FUNCTION hms.search_patients_by_name(p_name text)
  RETURNS TABLE (
    id uuid, mrn text, identity_status text, name_bn text, name_en text, sex text,
    birth_date date, birth_date_precision text, birth_year smallint, phone_normalized text
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = hms, pg_temp
  SET pg_trgm.word_similarity_threshold = 0.4
AS $$
  WITH matches AS (
    (SELECT p.*, p_name OPERATOR(hms.<<->) p.name_en AS distance
       FROM hms.patient p
      WHERE p_name !~ '[ঀ-৿]'
        AND p.tenant_id = hms.current_tenant_id() AND p_name OPERATOR(hms.<%) p.name_en
      ORDER BY p_name OPERATOR(hms.<<->) p.name_en
      LIMIT 20)
    UNION ALL
    (SELECT p.*, p_name OPERATOR(hms.<<->) p.name_bn AS distance
       FROM hms.patient p
      WHERE p_name ~ '[ঀ-৿]'
        AND p.tenant_id = hms.current_tenant_id() AND p_name OPERATOR(hms.<%) p.name_bn
      ORDER BY p_name OPERATOR(hms.<<->) p.name_bn
      LIMIT 20)
  ), best AS (
    SELECT DISTINCT ON (m.id) m.* FROM matches m ORDER BY m.id, m.distance
  )
  SELECT b.id, b.mrn, b.identity_status, b.name_bn, b.name_en, b.sex, b.birth_date,
         b.birth_date_precision, b.birth_year, b.phone_normalized
    FROM best b
   ORDER BY b.distance, b.created_at DESC
   LIMIT 20
$$;

REVOKE ALL ON FUNCTION hms.search_patients_by_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hms.search_patients_by_name(text) TO hms_app;
