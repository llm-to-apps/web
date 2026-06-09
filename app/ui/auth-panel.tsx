'use client';

import { FormEvent, useState } from 'react';
import { AtSign, Loader2, Lock, LogIn, UserPlus } from 'lucide-react';

type AuthMode = 'register' | 'login';

type AuthResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
    };

export function AuthPanel() {
  const [mode, setMode] = useState<AuthMode>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<AuthResult | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setResult(null);

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          email,
          password
        })
      });
      const data = (await response.json()) as AuthResult;

      if (!response.ok || !data.ok) {
        setResult({
          ok: false,
          message: 'message' in data ? data.message : 'Authentication failed'
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

  return (
    <form className="form auth-form" onSubmit={onSubmit}>
      <div className="segmented" role="tablist" aria-label="Authentication mode">
        <button
          type="button"
          className={mode === 'register' ? 'active' : ''}
          onClick={() => setMode('register')}
        >
          <UserPlus size={16} />
          Register
        </button>
        <button
          type="button"
          className={mode === 'login' ? 'active' : ''}
          onClick={() => setMode('login')}
        >
          <LogIn size={16} />
          Sign in
        </button>
      </div>

      {mode === 'register' ? (
        <div className="field">
          <label htmlFor="name">Name</label>
          <div className="input-wrap">
            <UserPlus size={18} />
            <input
              id="name"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Anton"
            />
          </div>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="email">Email</label>
        <div className="input-wrap">
          <AtSign size={18} />
          <input
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

      <div className="field">
        <label htmlFor="password">Password</label>
        <div className="input-wrap">
          <Lock size={18} />
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            minLength={8}
            required
          />
        </div>
      </div>

      <button className="deploy-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? (
          <Loader2 size={18} />
        ) : mode === 'register' ? (
          <UserPlus size={18} />
        ) : (
          <LogIn size={18} />
        )}
        {isSubmitting ? 'Working' : mode === 'register' ? 'Create account' : 'Sign in'}
      </button>

      <div className={`result ${result?.ok === false ? 'error' : ''}`}>
        {result?.ok === false
          ? result.message
          : mode === 'register'
            ? 'Create an account to deploy and manage apps.'
            : 'Sign in to continue to your templates.'}
      </div>
    </form>
  );
}
