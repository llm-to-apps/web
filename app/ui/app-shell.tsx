import type { ReactNode } from 'react';
import type { CurrentUser } from '@/lib/auth';
import Image from 'next/image';
import { prisma } from '@/lib/db';
import { getRequestDictionary } from '@/lib/i18n/server';
import { AccountMenu } from './account-menu';
import { HeaderNav } from './header-nav';

type AppShellProps = {
  user: CurrentUser | null;
  title?: string;
  description?: string;
  children: ReactNode;
};

export async function AppShell({
  user,
  title,
  description,
  children
}: AppShellProps) {
  const t = await getRequestDictionary();

  if (user) {
    const creditUsageSummary = await prisma.creditLedgerEntry.aggregate({
      where: {
        actorUserId: user.id,
        sourceType: 'agent_run'
      },
      _sum: {
        credits: true
      }
    });
    const usageSummary = formatUsageSummary(formatCreditsUsed(creditUsageSummary._sum.credits));

    return (
      <main className="app-layout">
        <header className="app-header">
          <div className="app-header-inner">
            <div className="app-header-brand">
              <Image
                src="/brand/os7-logo.svg"
                alt="OS7"
                width={72}
                height={38}
                priority
              />
              <span className="app-header-beta">Beta</span>
            </div>
            <HeaderNav />

            <div className="app-header-actions">
              {usageSummary ? (
                <span className="header-credit-summary" title={usageSummary.title}>
                  <strong>{usageSummary.total}</strong>
                </span>
              ) : null}
              <AccountMenu user={user} />
            </div>
          </div>
        </header>

        <section className="app-main">
          <div className="workspace">
            {title || description ? (
              <header className="section-heading">
                <div>
                  {title ? <h2>{title}</h2> : null}
                  {description ? <p>{description}</p> : null}
                </div>
              </header>
            ) : null}
            {children}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div>
          <div className="brand">
            <Image
              src="/brand/os7-logo.svg"
              alt="OS7"
              width={96}
              height={50}
              priority
            />
            <span className="brand-beta">{t.appShell.beta}</span>
          </div>
          <h1>{t.appShell.tagline}</h1>
          <p>{t.appShell.intro}</p>
        </div>
        <dl>
          <div>
            <dt>{t.appShell.runtimeLabel}</dt>
            <dd>{t.appShell.runtimeText}</dd>
          </div>
          <div>
            <dt>{t.appShell.sourceLabel}</dt>
            <dd>{t.appShell.sourceText}</dd>
          </div>
          <div>
            <dt>{t.appShell.thesisLabel}</dt>
            <dd>{t.appShell.thesisText}</dd>
          </div>
        </dl>
      </aside>

      <section className="main">
        <div className="workspace">
          <header className="section-heading">
            <div>
              {title ? <h2>{title}</h2> : null}
              {description ? <p>{description}</p> : null}
            </div>
          </header>

          {children}
        </div>
      </section>
    </main>
  );
}

function formatUsageSummary(creditsUsed: number) {
  if (creditsUsed <= 0) {
    return null;
  }

  const formattedCredits = formatCredits(creditsUsed);

  return {
    title: `${formattedCredits} credits used`,
    total: `${formattedCredits} ₵`
  };
}

function formatCreditsUsed(value: unknown) {
  const numericValue = Number(value ?? 0);
  return Math.ceil(Math.abs(Math.min(numericValue, 0)));
}

function formatCredits(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  }).format(value);
}
