-- Guardrails enforced by the database itself, so no application bug can bypass them.
--   1. Tenant isolation: row-level security keyed on the session setting app.society_id.
--   2. Posted journal entries, journal lines and audit events are append-only.
--   3. Every journal entry balances (debits = credits) and has at least two lines, checked at commit.
--   4. Member control accounts always carry a member; other accounts never do.
-- The application connects as coop_app, which is not the table owner, so RLS always applies.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'coop_app') THEN
    CREATE ROLE coop_app LOGIN PASSWORD 'coop_app_dev_only';
  END IF;
END
$$;
--> statement-breakpoint
CREATE FUNCTION app_society_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.society_id', true), '')::uuid
$$;
--> statement-breakpoint
ALTER TABLE societies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE society_users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ledger_accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY society_isolation ON societies USING (id = app_society_id()) WITH CHECK (id = app_society_id());
--> statement-breakpoint
CREATE POLICY society_isolation ON society_users USING (society_id = app_society_id()) WITH CHECK (society_id = app_society_id());
--> statement-breakpoint
CREATE POLICY society_isolation ON members USING (society_id = app_society_id()) WITH CHECK (society_id = app_society_id());
--> statement-breakpoint
CREATE POLICY society_isolation ON ledger_accounts USING (society_id = app_society_id()) WITH CHECK (society_id = app_society_id());
--> statement-breakpoint
CREATE POLICY society_isolation ON journal_entries USING (society_id = app_society_id()) WITH CHECK (society_id = app_society_id());
--> statement-breakpoint
CREATE POLICY society_isolation ON journal_lines USING (society_id = app_society_id()) WITH CHECK (society_id = app_society_id());
--> statement-breakpoint
CREATE POLICY society_isolation ON audit_events USING (society_id = app_society_id()) WITH CHECK (society_id = app_society_id());
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO coop_app;
--> statement-breakpoint
GRANT SELECT ON users TO coop_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON societies, society_users, members, ledger_accounts TO coop_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON journal_entries, journal_lines, audit_events TO coop_app;
--> statement-breakpoint
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO coop_app;
--> statement-breakpoint
CREATE FUNCTION forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only; post a reversal or a new event instead', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END
$$;
--> statement-breakpoint
CREATE TRIGGER journal_entries_append_only BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER journal_lines_append_only BEFORE UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE FUNCTION check_entry_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target uuid;
  line_count integer;
  net bigint;
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    target := NEW.id;
  ELSE
    target := NEW.entry_id;
  END IF;
  SELECT count(*), coalesce(sum(CASE side WHEN 'debit' THEN amount ELSE -amount END), 0)
    INTO line_count, net
    FROM journal_lines WHERE entry_id = target;
  IF line_count < 2 THEN
    RAISE EXCEPTION 'Journal entry % has % line(s); at least two are required', target, line_count
      USING ERRCODE = 'check_violation';
  END IF;
  IF net <> 0 THEN
    RAISE EXCEPTION 'Journal entry % does not balance (debits minus credits = % kobo)', target, net
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER journal_lines_balanced AFTER INSERT ON journal_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_entry_balanced();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER journal_entries_have_lines AFTER INSERT ON journal_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_entry_balanced();
--> statement-breakpoint
CREATE FUNCTION check_member_control() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  control boolean;
BEGIN
  SELECT is_member_control INTO control FROM ledger_accounts WHERE id = NEW.account_id;
  IF control AND NEW.member_id IS NULL THEN
    RAISE EXCEPTION 'Account % is a member control account; the line must name a member', NEW.account_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT control AND NEW.member_id IS NOT NULL THEN
    RAISE EXCEPTION 'Account % is not a member control account; the line must not name a member', NEW.account_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER journal_lines_member_control BEFORE INSERT ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION check_member_control();
