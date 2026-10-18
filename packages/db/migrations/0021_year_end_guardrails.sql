-- Year-end: closing entries are marked, and a closed year is locked against new entries.
ALTER TABLE journal_submissions ADD CONSTRAINT journal_submissions_kind CHECK (kind IN ('standard', 'closing'));
--> statement-breakpoint
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_kind CHECK (kind IN ('standard', 'closing'));
--> statement-breakpoint
ALTER TABLE financial_years ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY society_isolation ON financial_years USING (society_id = app_society_id()) WITH CHECK (society_id = app_society_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON financial_years TO coop_app;
--> statement-breakpoint
-- The kind of an entry must match its submission, and nothing may be posted into a closed year.
CREATE FUNCTION check_period_open() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.submission_id IS NOT NULL AND NEW.kind IS DISTINCT FROM (SELECT kind FROM journal_submissions WHERE id = NEW.submission_id) THEN
    RAISE EXCEPTION 'Journal entry kind does not match its submission' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind <> 'closing' AND EXISTS (
    SELECT 1 FROM financial_years f WHERE f.society_id = NEW.society_id AND f.status = 'closed' AND NEW.entry_date <= f.end_date
  ) THEN
    RAISE EXCEPTION 'The books are closed up to that date; date the entry in an open year' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER journal_entries_period_open BEFORE INSERT ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION check_period_open();
