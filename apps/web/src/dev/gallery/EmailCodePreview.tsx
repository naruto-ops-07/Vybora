import { EMAIL_CODE_LENGTH } from '@vybora/core';
import { AuthLayout } from '@/routes/auth/AuthLayout';
import { EmailCodeStep } from '@/routes/auth/EmailCodeStep';

const EMAIL = 'maya@example.com';

/**
 * Dev-only: the sign-up email-code step exactly as Signup draws it, with no-op
 * handlers, so screenshots can show it without sending anything.
 */
export default function EmailCodePreview() {
  return (
    <AuthLayout
      title="Enter the code"
      subtitle={
        <>
          We sent a {EMAIL_CODE_LENGTH}-digit code to{' '}
          <strong className="break-anywhere font-semibold text-ink">{EMAIL}</strong>.
        </>
      }
      footer="You can also open the link in the email on this device."
    >
      <EmailCodeStep
        email={EMAIL}
        purpose="signup"
        onVerified={() => {}}
        onResend={() => Promise.resolve()}
        onChangeEmail={() => {}}
      />
    </AuthLayout>
  );
}
