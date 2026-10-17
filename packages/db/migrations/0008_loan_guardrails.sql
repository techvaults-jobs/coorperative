-- Loans and products: society isolation, and the loan sub-ledger tied to the right member.
-- A line tagged with a loan is either on a member account for the borrower, or on a
-- non-member account (interest, fees) with no member.

ALTER TABLE journal_lines ADD CONSTRAINT journal_lines_loan_fk
  FOREIGN KEY (society_id, loan_id) REFERENCES loans (society_id, id);
--> statement-breakpoint
CREATE FUNCTION check_loan_line() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  borrower uuid;
BEGIN
  IF NEW.loan_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT member_id INTO borrower FROM loans WHERE id = NEW.loan_id AND society_id = NEW.society_id;
  IF borrower IS NULL OR (NEW.member_id IS NOT NULL AND NEW.member_id <> borrower) THEN
    RAISE EXCEPTION 'A line for loan % may only name the borrowing member', NEW.loan_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER journal_lines_loan_member BEFORE INSERT ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION check_loan_line();
--> statement-breakpoint
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE loan_guarantors ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY society_isolation ON products USING (society_id = app_society_id()) WITH CHECK (society_id = app_society_id());
--> statement-breakpoint
CREATE POLICY society_isolation ON loans USING (society_id = app_society_id()) WITH CHECK (society_id = app_society_id());
--> statement-breakpoint
CREATE POLICY society_isolation ON loan_guarantors USING (society_id = app_society_id()) WITH CHECK (society_id = app_society_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON products, loans TO coop_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON loan_guarantors TO coop_app;
