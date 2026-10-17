import { AuthShell } from "@/components/auth-shell";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Forgot your password?" description="Enter the email you sign in with and we'll send you a link to choose a new one.">
      <ForgotForm />
    </AuthShell>
  );
}
