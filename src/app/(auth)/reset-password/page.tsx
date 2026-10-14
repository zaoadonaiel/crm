import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/password-forms";

export default function Page() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
