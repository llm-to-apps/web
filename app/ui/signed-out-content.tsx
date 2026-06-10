import { AuthPanel } from './auth-panel';
import { AppIcon } from './app-icon';

export function SignedOutContent() {
  return (
    <div className="auth-grid">
      <article className="template">
        <div className="template-header">
          <div className="template-title">
            <AppIcon templateId="money" />
            <div>
              <h3>Money</h3>
              <p>Enter your email to deploy your first MySQL-backed app.</p>
            </div>
          </div>
        </div>
        <div className="meta">
          <div>
            <span>Auth</span>
            <strong>Email code</strong>
          </div>
          <div>
            <span>Session</span>
            <strong>HTTP-only</strong>
          </div>
          <div>
            <span>Deploy</span>
            <strong>After sign in</strong>
          </div>
        </div>
      </article>

      <AuthPanel />
    </div>
  );
}
