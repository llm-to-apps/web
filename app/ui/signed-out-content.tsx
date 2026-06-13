import { AuthPanel } from './auth-panel';

type SignedOutContentProps = {
  redirectTo?: string;
};

export function SignedOutContent({ redirectTo }: SignedOutContentProps) {
  return (
    <div className="auth-grid auth-grid-single">
      <AuthPanel redirectTo={redirectTo} />
    </div>
  );
}
