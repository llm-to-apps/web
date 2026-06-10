import { AuthPanel } from './auth-panel';

export function SignedOutContent() {
  return (
    <div className="auth-grid auth-grid-single">
      <AuthPanel />
    </div>
  );
}
