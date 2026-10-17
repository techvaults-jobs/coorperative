-- Maker-checker, gap-free numbering and officer invitations, enforced by the database.
--   1. A journal entry can only be inserted for an approved submission, by an approver who
--      is not the preparer. Entries are numbered 1, 2, 3… per society with no gaps.
--   2. A submission's content never changes; its decision is made once.
--   3. Invitations are society-scoped; a link is looked up by token hash through one narrow function.

-- Entry numbers were a global sequence. From now on each society counts its own entries.
ALTER TABLE journal_entries ALTER COLUMN entry_no SET DEFAULT 0;
--> statement-breakpoint
DROP SEQUENCE IF EXISTS journal_entries_entry_no_seq;
--> statement-breakpoint
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_submission_fk
  FOREIGN KEY (society_id, submission_id) REFERENCES journal_submissions (society_id, id);
--> statement-breakpoint
ALTER TABLE journal_submissions ADD CONSTRAINT journal_submissions_separation_of_duties CHECK (
  (status NOT IN ('approved', 'rejected') OR decided_by <> prepared_by)
  AND (status <> 'withdrawn' OR decided_by = prepared_by)
);
--> statement-breakpoint
CREATE FUNCTION prepare_journal_entry() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  s journal_submissions%ROWTYPE;
BEGIN
  IF NEW.submission_id IS NULL THEN
    RAISE EXCEPTION 'Journal entries are posted only by approving a submission'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO s FROM journal_submissions WHERE id = NEW.submission_id AND society_id = NEW.society_id;
  IF NOT FOUND OR s.status <> 'approved' THEN
    RAISE EXCEPTION 'Submission % is not approved', NEW.submission_id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.prepared_by <> s.prepared_by OR NEW.posted_by IS DISTINCT FROM s.decided_by
     OR NEW.reverses_entry_id IS DISTINCT FROM s.reverses_entry_id
     OR NEW.entry_date <> s.entry_date OR NEW.description <> s.description THEN
    RAISE EXCEPTION 'Journal entry does not match its approved submission %', NEW.submission_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.posted_by = NEW.prepared_by THEN
    RAISE EXCEPTION 'The person who prepared an entry cannot approve it' USING ERRCODE = 'check_violation';
  END IF;
  -- Serialise numbering per society so two approvals can never take the same number or skip one.
  PERFORM pg_advisory_xact_lock(hashtextextended('journal:' || NEW.society_id::text, 0));
  SELECT coalesce(max(entry_no), 0) + 1 INTO NEW.entry_no FROM journal_entries WHERE society_id = NEW.society_id;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER journal_entries_prepare BEFORE INSERT ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION prepare_journal_entry();
--> statement-breakpoint
CREATE FUNCTION guard_submission_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'journal_submissions rows are kept for the audit trail' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Submission % was already %', OLD.id, OLD.status USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.id, NEW.society_id, NEW.entry_date, NEW.description, NEW.idempotency_key, NEW.lines,
      NEW.reverses_entry_id, NEW.prepared_by, NEW.prepared_at)
     IS DISTINCT FROM
     (OLD.id, OLD.society_id, OLD.entry_date, OLD.description, OLD.idempotency_key, OLD.lines,
      OLD.reverses_entry_id, OLD.prepared_by, OLD.prepared_at) THEN
    RAISE EXCEPTION 'A submission cannot be edited; withdraw it and submit a new one' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER journal_submissions_guard BEFORE UPDATE OR DELETE ON journal_submissions
  FOR EACH ROW EXECUTE FUNCTION guard_submission_change();
--> statement-breakpoint
-- An approval must post its entry in the same transaction.
CREATE FUNCTION check_approval_posted() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'approved' AND NOT EXISTS (SELECT 1 FROM journal_entries WHERE submission_id = NEW.id) THEN
    RAISE EXCEPTION 'Submission % was approved without posting its entry', NEW.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER journal_submissions_approval_posted AFTER UPDATE ON journal_submissions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_approval_posted();
--> statement-breakpoint
CREATE FUNCTION guard_invitation_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.accepted_at IS NOT NULL OR OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation % is already closed', OLD.id USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER officer_invitations_guard BEFORE UPDATE ON officer_invitations
  FOR EACH ROW EXECUTE FUNCTION guard_invitation_change();
--> statement-breakpoint
ALTER TABLE journal_submissions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE officer_invitations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY society_isolation ON journal_submissions USING (society_id = app_society_id()) WITH CHECK (society_id = app_society_id());
--> statement-breakpoint
CREATE POLICY society_isolation ON officer_invitations USING (society_id = app_society_id()) WITH CHECK (society_id = app_society_id());
--> statement-breakpoint
GRANT SELECT, INSERT ON journal_submissions, officer_invitations TO coop_app;
--> statement-breakpoint
GRANT UPDATE (status, decided_by, decided_at, decision_reason) ON journal_submissions TO coop_app;
--> statement-breakpoint
GRANT UPDATE (accepted_at, accepted_by, revoked_at, revoked_by) ON officer_invitations TO coop_app;
--> statement-breakpoint
-- Officers can be removed from a society.
GRANT DELETE ON society_users TO coop_app;
--> statement-breakpoint
-- An invitation link is opened before any society is in scope. This answers exactly one
-- question: which invitation, if any, has this token hash. It runs with the owner's rights.
CREATE FUNCTION invitation_for_token(p_token_hash text)
RETURNS TABLE (id uuid, society_id uuid, society_name text, email text, roles text[],
               expires_at timestamptz, accepted_at timestamptz, revoked_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.society_id, s.name, i.email, i.roles, i.expires_at, i.accepted_at, i.revoked_at
  FROM officer_invitations i
  JOIN societies s ON s.id = i.society_id
  WHERE i.token_hash = p_token_hash
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION invitation_for_token(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION invitation_for_token(text) TO coop_app;
