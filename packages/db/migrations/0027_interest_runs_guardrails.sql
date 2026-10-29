-- Interest runs: society isolation and grants. A run's charges are written once with the run
-- and never change; a run only moves submitted → posted or submitted → abandoned.
ALTER TABLE interest_runs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE interest_charges ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY society_isolation ON interest_runs USING (society_id = app_society_id()) WITH CHECK (society_id = app_society_id());
--> statement-breakpoint
CREATE POLICY society_isolation ON interest_charges USING (society_id = app_society_id()) WITH CHECK (society_id = app_society_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE (status) ON interest_runs TO coop_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON interest_charges TO coop_app;
--> statement-breakpoint
CREATE FUNCTION guard_interest_run_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'submitted' AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'Interest run % is % and can no longer change', OLD.id, OLD.status USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER interest_runs_status_guard BEFORE UPDATE ON interest_runs
  FOR EACH ROW EXECUTE FUNCTION guard_interest_run_status();
--> statement-breakpoint
-- Charges are added only while their run is waiting for approval.
CREATE FUNCTION guard_interest_charges() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT status FROM interest_runs WHERE id = NEW.run_id) <> 'submitted' THEN
    RAISE EXCEPTION 'Interest run % is closed to new charges', NEW.run_id USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER interest_charges_guard BEFORE INSERT ON interest_charges
  FOR EACH ROW EXECUTE FUNCTION guard_interest_charges();
