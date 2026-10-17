-- Payroll tables: society isolation and grants. Drafts can be rebuilt, so items and
-- remittance lines can be deleted while a run is open (the service enforces when).
ALTER TABLE member_contributions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payroll_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payroll_remittance_lines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY society_isolation ON member_contributions USING (society_id = app_society_id()) WITH CHECK (society_id = app_society_id());
--> statement-breakpoint
CREATE POLICY society_isolation ON payroll_runs USING (society_id = app_society_id()) WITH CHECK (society_id = app_society_id());
--> statement-breakpoint
CREATE POLICY society_isolation ON payroll_items USING (society_id = app_society_id()) WITH CHECK (society_id = app_society_id());
--> statement-breakpoint
CREATE POLICY society_isolation ON payroll_remittance_lines USING (society_id = app_society_id()) WITH CHECK (society_id = app_society_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON member_contributions, payroll_items, payroll_remittance_lines TO coop_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON payroll_runs TO coop_app;
--> statement-breakpoint
-- A posted run is history: its schedule and allocation can't change.
CREATE FUNCTION guard_posted_payroll() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  run_status payroll_status;
BEGIN
  SELECT status INTO run_status FROM payroll_runs WHERE id = COALESCE(NEW.run_id, OLD.run_id);
  IF run_status IN ('submitted', 'posted') THEN
    RAISE EXCEPTION 'Payroll run % is % and can no longer change', COALESCE(NEW.run_id, OLD.run_id), run_status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$$;
--> statement-breakpoint
CREATE TRIGGER payroll_items_guard BEFORE INSERT OR UPDATE OR DELETE ON payroll_items
  FOR EACH ROW EXECUTE FUNCTION guard_posted_payroll();
--> statement-breakpoint
CREATE TRIGGER payroll_remittance_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON payroll_remittance_lines
  FOR EACH ROW EXECUTE FUNCTION guard_posted_payroll();
