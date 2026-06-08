'use client';

import { FormEvent, useState } from 'react';
import { ArrowUpRight, AtSign, Globe2, Loader2 } from 'lucide-react';

type DeployResult =
  | {
      ok: true;
      url: string;
      projectId: string;
      template: string;
    }
  | {
      ok: false;
      message: string;
    };

export function DeployPanel() {
  const [email, setEmail] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [isDeploying, setIsDeploying] = useState(false);
  const [result, setResult] = useState<DeployResult | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsDeploying(true);
    setResult(null);

    try {
      const response = await fetch('/api/projects/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          subdomain,
          templateId: 'money'
        })
      });
      const data = (await response.json()) as DeployResult;

      setResult(
        response.ok
          ? data
          : {
              ok: false,
              message:
                'message' in data ? data.message : 'Deployment request failed'
            }
      );
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message : 'Deployment failed'
      });
    } finally {
      setIsDeploying(false);
    }
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="email">Owner email</label>
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
        <label htmlFor="subdomain">Subdomain</label>
        <div className="input-wrap">
          <Globe2 size={18} />
          <input
            id="subdomain"
            name="subdomain"
            value={subdomain}
            onChange={(event) => setSubdomain(event.target.value)}
            placeholder="demo"
            pattern="[a-zA-Z0-9-]+"
            required
          />
        </div>
      </div>

      <button className="deploy-button" type="submit" disabled={isDeploying}>
        {isDeploying ? <Loader2 size={18} /> : <ArrowUpRight size={18} />}
        {isDeploying ? 'Deploying' : 'Deploy Money'}
      </button>

      {result ? (
        <div className={`result ${result.ok ? 'success' : 'error'}`}>
          {result.ok
            ? `Project ${result.projectId} is deploying at ${result.url}`
            : result.message}
        </div>
      ) : (
        <div className="result">Money will deploy from money-template.</div>
      )}
    </form>
  );
}
