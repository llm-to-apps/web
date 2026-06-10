'use client';

import { FormEvent, MouseEvent, useState } from 'react';
import { AtSign, KeyRound, Loader2, LogIn, Mail } from 'lucide-react';

type AuthStep = 'email' | 'code';

type AuthResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
    };

export function AuthPanel() {
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
          message: 'message' in data ? data.message : 'Authentication failed'
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

      window.location.reload();
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message : 'Authentication failed'
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function restart(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    setStep('email');
    setCode('');
    setResult(null);
  }

  return (
    <form className="form auth-form" onSubmit={onSubmit}>
      <div className="auth-title">
        <div className="auth-title-icon">
          {step === 'email' ? <Mail size={18} /> : <KeyRound size={18} />}
        </div>
        <div>
          <h3>{step === 'email' ? 'Sign in with email' : 'Enter your code'}</h3>
          <p>
            {step === 'email'
              ? 'Use one email for new and existing accounts.'
              : `Code sent to ${email}. Any code works in development.`}
          </p>
        </div>
      </div>

      <div className="field">
        <label htmlFor="email">Email</label>
        <div className="input-wrap">
          <AtSign size={18} />
          <input
            disabled={step === 'code'}
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
      </div>

      {step === 'code' ? (
        <div className="field">
          <label htmlFor="code">Code</label>
          <div className="input-wrap">
            <KeyRound size={18} />
            <input
              autoFocus
              id="code"
              name="code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
              required
            />
          </div>
        </div>
      ) : null}

      <button className="deploy-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? (
          <Loader2 size={18} />
        ) : step === 'email' ? (
          <Mail size={18} />
        ) : (
          <LogIn size={18} />
        )}
        {isSubmitting ? 'Working' : step === 'email' ? 'Continue' : 'Sign in'}
      </button>

      {step === 'code' ? (
        <button className="ghost-button auth-secondary-button" type="button" onClick={restart}>
          Use another email
        </button>
      ) : null}

      {result?.ok === false || step === 'code' ? (
        <div className={`result ${result?.ok === false ? 'error' : ''}`}>
          {result?.ok === false ? result.message : 'Development mode accepts any code.'}
        </div>
      ) : null}
    </form>
  );
}
