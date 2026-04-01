-- 076_native_apply.sql — Separate native applications from external clicks

-- ── 1. Make apply_url nullable (listings without it accept native applications) ──
ALTER TABLE job_listings ALTER COLUMN apply_url DROP NOT NULL;

-- ── 2. Add click_count for external link tracking ──
ALTER TABLE job_listings ADD COLUMN click_count integer NOT NULL DEFAULT 0;

-- ── 3. Add type to job_applications ──
ALTER TABLE job_applications
  ADD COLUMN type text NOT NULL DEFAULT 'native'
    CHECK (type IN ('native', 'external_click'));

-- ── 4. Add contact fields to career_profiles (PII — never expose publicly) ──
ALTER TABLE career_profiles
  ADD COLUMN first_name text,
  ADD COLUMN last_name text,
  ADD COLUMN email text,
  ADD COLUMN phone text,
  ADD COLUMN resume_url text;

-- ── 5. Expand event types ──
ALTER TABLE job_listing_events DROP CONSTRAINT job_listing_events_event_type_check;
ALTER TABLE job_listing_events
  ADD CONSTRAINT job_listing_events_event_type_check
    CHECK (event_type IN ('view', 'apply_click', 'profile_copy', 'save', 'external_click'));

-- ── 6. Update counter RPC to support click_count ──
CREATE OR REPLACE FUNCTION increment_job_counter(
  p_listing_id uuid,
  p_column text
)
RETURNS void AS $$
BEGIN
  IF p_column = 'view_count' THEN
    UPDATE job_listings SET view_count = view_count + 1 WHERE id = p_listing_id;
  ELSIF p_column = 'apply_count' THEN
    UPDATE job_listings SET apply_count = apply_count + 1 WHERE id = p_listing_id;
  ELSIF p_column = 'profile_count' THEN
    UPDATE job_listings SET profile_count = profile_count + 1 WHERE id = p_listing_id;
  ELSIF p_column = 'click_count' THEN
    UPDATE job_listings SET click_count = click_count + 1 WHERE id = p_listing_id;
  ELSE
    RAISE EXCEPTION 'Invalid column: %', p_column;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 7. Backfill: mark existing applications for external listings ──
UPDATE job_applications
SET type = 'external_click'
WHERE listing_id IN (
  SELECT id FROM job_listings WHERE apply_url IS NOT NULL
);

-- ── 8. Index for filtering applications by type ──
CREATE INDEX idx_job_applications_type ON job_applications(type);
