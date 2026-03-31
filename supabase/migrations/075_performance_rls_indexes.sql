-- Performance: wrap auth.uid() in (select auth.uid()) for InitPlan caching
-- and add missing indexes on hot lookup columns.
--
-- Benchmark on developers (72K rows):
--   auth.uid() without wrapper, no index: 197ms
--   (select auth.uid()) with index:       0.18ms  (1000x faster)

-- ──────────────────────────────────────────────────
-- 1. Index on developers.claimed_by (used by almost every RLS policy)
-- ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_developers_claimed_by
  ON developers (claimed_by) WHERE claimed_by IS NOT NULL;

-- ──────────────────────────────────────────────────
-- 2. Drop redundant indexes (duplicates of unique constraints)
-- ──────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_advertiser_sessions_token;
DROP INDEX IF EXISTS idx_job_applications_listing;
DROP INDEX IF EXISTS idx_developers_login;
DROP INDEX IF EXISTS idx_developers_vscode_api_key_hash;

-- ──────────────────────────────────────────────────
-- 3. Composite index for events sparkline query
-- ──────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_job_listing_events_listing;
CREATE INDEX IF NOT EXISTS idx_job_listing_events_listing_date
  ON job_listing_events (listing_id, created_at);

-- ──────────────────────────────────────────────────
-- 4. Rewrite RLS policies to use (select auth.uid())
-- ──────────────────────────────────────────────────

-- arcade_avatars
DROP POLICY IF EXISTS "Users can read own avatar" ON arcade_avatars;
CREATE POLICY "Users can read own avatar" ON arcade_avatars
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own avatar" ON arcade_avatars;
CREATE POLICY "Users can update own avatar" ON arcade_avatars
  FOR UPDATE TO authenticated USING (user_id = (select auth.uid()));

-- arcade_discoveries
DROP POLICY IF EXISTS "Users can read own discoveries" ON arcade_discoveries;
CREATE POLICY "Users can read own discoveries" ON arcade_discoveries
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own discoveries" ON arcade_discoveries;
CREATE POLICY "Users can update own discoveries" ON arcade_discoveries
  FOR UPDATE TO authenticated USING (user_id = (select auth.uid()));

-- arcade_room_favorites
DROP POLICY IF EXISTS "Users can read own favorites" ON arcade_room_favorites;
CREATE POLICY "Users can read own favorites" ON arcade_room_favorites
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can manage own favorites" ON arcade_room_favorites;
CREATE POLICY "Users can manage own favorites" ON arcade_room_favorites
  FOR ALL TO authenticated USING ((select auth.uid()) = user_id);

-- arcade_room_visits
DROP POLICY IF EXISTS "Users can read own visits" ON arcade_room_visits;
CREATE POLICY "Users can read own visits" ON arcade_room_visits
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

-- arcade_rooms
DROP POLICY IF EXISTS "Owners can update their rooms" ON arcade_rooms;
CREATE POLICY "Owners can update their rooms" ON arcade_rooms
  FOR UPDATE TO authenticated USING ((select auth.uid()) = owner_id);

DROP POLICY IF EXISTS "Visible rooms are readable by everyone" ON arcade_rooms;
CREATE POLICY "Visible rooms are readable by everyone" ON arcade_rooms
  FOR SELECT USING (
    visibility IN ('open', 'password')
    OR (select auth.uid()) = owner_id
    OR auth.role() = 'service_role'
  );

-- career_profiles
DROP POLICY IF EXISTS "Own profile readable by owner" ON career_profiles;
CREATE POLICY "Own profile readable by owner" ON career_profiles
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR id = (SELECT d.id FROM developers d WHERE d.claimed_by = (select auth.uid()) LIMIT 1)
  );

-- developer_customizations
DROP POLICY IF EXISTS "Owner reads own customizations" ON developer_customizations;
CREATE POLICY "Owner reads own customizations" ON developer_customizations
  FOR SELECT TO authenticated USING (
    developer_id IN (SELECT id FROM developers WHERE claimed_by = (select auth.uid()))
  );

-- job_applications
DROP POLICY IF EXISTS "Devs can see own applications" ON job_applications;
CREATE POLICY "Devs can see own applications" ON job_applications
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR developer_id = (SELECT d.id FROM developers d WHERE d.claimed_by = (select auth.uid()) LIMIT 1)
  );

-- notification_preferences
DROP POLICY IF EXISTS "Users can update own preferences" ON notification_preferences;
CREATE POLICY "Users can update own preferences" ON notification_preferences
  FOR UPDATE TO authenticated USING (
    developer_id IN (SELECT id FROM developers WHERE claimed_by = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Users can read own preferences" ON notification_preferences;
CREATE POLICY "Users can read own preferences" ON notification_preferences
  FOR SELECT TO authenticated USING (
    developer_id IN (SELECT id FROM developers WHERE claimed_by = (select auth.uid()))
  );

-- pixel_purchases
DROP POLICY IF EXISTS "pp_read" ON pixel_purchases;
CREATE POLICY "pp_read" ON pixel_purchases
  FOR SELECT TO authenticated USING (
    developer_id = (SELECT id FROM developers WHERE claimed_by = (select auth.uid()))
  );

-- purchases
DROP POLICY IF EXISTS "Owner reads own purchases" ON purchases;
CREATE POLICY "Owner reads own purchases" ON purchases
  FOR SELECT TO authenticated USING (
    developer_id IN (SELECT id FROM developers WHERE claimed_by = (select auth.uid()))
  );

-- push_subscriptions
DROP POLICY IF EXISTS "Users can manage own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users can manage own push subscriptions" ON push_subscriptions
  FOR ALL TO authenticated USING (
    developer_id IN (SELECT id FROM developers WHERE claimed_by = (select auth.uid()))
  );

-- streak_rewards
DROP POLICY IF EXISTS "Users can read own streak rewards" ON streak_rewards;
CREATE POLICY "Users can read own streak rewards" ON streak_rewards
  FOR SELECT TO authenticated USING (
    developer_id IN (SELECT id FROM developers WHERE claimed_by = (select auth.uid()))
  );

-- survey_responses
DROP POLICY IF EXISTS "Users can read their own responses" ON survey_responses;
CREATE POLICY "Users can read their own responses" ON survey_responses
  FOR SELECT TO authenticated USING (
    developer_id = (SELECT d.id FROM developers d WHERE d.claimed_by = (select auth.uid()) LIMIT 1)
  );

-- wallet_transactions
DROP POLICY IF EXISTS "tx_read" ON wallet_transactions;
CREATE POLICY "tx_read" ON wallet_transactions
  FOR SELECT TO authenticated USING (
    developer_id = (SELECT id FROM developers WHERE claimed_by = (select auth.uid()))
  );

-- wallets
DROP POLICY IF EXISTS "wallet_read" ON wallets;
CREATE POLICY "wallet_read" ON wallets
  FOR SELECT TO authenticated USING (
    developer_id = (SELECT id FROM developers WHERE claimed_by = (select auth.uid()))
  );
