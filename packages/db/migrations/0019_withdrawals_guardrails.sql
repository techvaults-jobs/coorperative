ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY society_isolation ON withdrawals USING (society_id = app_society_id()) WITH CHECK (society_id = app_society_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON withdrawals TO coop_app;
