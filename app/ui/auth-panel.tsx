'use client';

import { FormEvent, useState } from 'react';
import { AtSign, KeyRound, LogIn, Mail } from 'lucide-react';
import { Button } from './button';
import { FormField } from './form-field';
import { useI18n } from './i18n-provider';
import { LanguageSwitcher } from './language-switcher';

type AuthStep = 'email' | 'code';

type AuthResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
    };

type AuthPanelProps = {
  redirectTo?: string;
};

export function AuthPanel({ redirectTo = '/home' }: AuthPanelProps) {
  const { format, t } = useI18n();
  const [step, setStep] = useState<AuthStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<AuthResult | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setResult(null);

    try {
      const response = await fetch(
        step === 'email' ? '/api/auth/email/start' : '/api/auth/email/verify',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email,
            code
          })
        }
      );
      const data = (await response.json()) as AuthResult;

      if (!response.ok || !data.ok) {
        setResult({
          ok: false,
          message: 'message' in data ? data.message : t.auth.authenticationFailed
        });
        return;
      }

      if (step === 'email') {
        setStep('code');
        setResult({
          ok: true
        });
        return;
      }

      window.location.assign(redirectTo);
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message : t.auth.authenticationFailed
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-panel-stack">
      <form className="form auth-form" onSubmit={onSubmit}>
      <div className="auth-title">
        <div className="auth-title-icon">
          {step === 'email' ? <Mail size={18} /> : <KeyRound size={18} />}
        </div>
        <div>
          <h3>{step === 'email' ? t.auth.emailTitle : t.auth.codeTitle}</h3>
          <p>
            {step === 'email'
              ? t.auth.emailDescription
              : format(t.auth.codeSent, { email })}
          </p>
        </div>
      </div>

      {step === 'email' ? (
        <FormField
          icon={<AtSign size={18} />}
          id="email"
          label={t.auth.emailLabel}
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t.auth.emailPlaceholder}
          required
          type="email"
          value={email}
        />
      ) : null}

      {step === 'code' ? (
        <FormField
          autoFocus
          icon={<KeyRound size={18} />}
          id="code"
          label={t.auth.codeLabel}
          name="code"
          onChange={(event) => setCode(event.target.value)}
          placeholder={t.auth.codePlaceholder}
          required
          value={code}
        />
      ) : null}

      <Button
        className="min-h-11"
        loading={isSubmitting}
        loadingLabel={t.auth.working}
        type="submit"
      >
        {step === 'email' ? <Mail size={18} /> : <LogIn size={18} />}
        {step === 'email' ? t.auth.continue : t.auth.signIn}
      </Button>

      {result?.ok === false ? <div className="result error">{result.message}</div> : null}
      </form>
      {step === 'email' ? <LanguageSwitcher variant="segmented" /> : null}
    </div>
  );
}
