'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AtSign, Mail } from 'lucide-react';
import { Alert, Button, Card, Input, PinInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useI18n } from './i18n-provider';
import { useSession } from './session-provider';
import { Os7Logo } from '../../ui-kit/src/os7-brand';

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

const UI_DELAY_MS = 250;

export function AuthPanel({ redirectTo = '/home' }: AuthPanelProps) {
  const { format, t } = useI18n();
  const router = useRouter();
  const session = useSession();
  const [step, setStep] = useState<AuthStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<AuthResult | null>(null);

  async function submitAuth(nextCode = code) {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setResult(null);

    try {
      if (step === 'code') {
        await waitForUiDelay();
      }

      const response = await fetch(
        step === 'email' ? '/api/auth/email/start' : '/api/auth/email/verify',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email,
            code: nextCode
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

      await session.refresh();
      router.push(redirectTo);
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message : t.auth.authenticationFailed
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitAuth();
  }

  function onCodeChange(nextCode: string) {
    setCode(nextCode);

    if (nextCode.length === 4) {
      void submitAuth(nextCode);
    }
  }

  return (
    <Stack gap="md" w="min(100%, 560px)">
      <Card component="form" onSubmit={onSubmit} p="xl" pos="relative">
        <Stack gap="md">
      <Stack align="center" gap="xs">
        <Os7Logo href="/" w={88} />
        <Title order={3} ta="center">{step === 'email' ? t.auth.emailTitle : t.auth.codeTitle}</Title>
      </Stack>

      {step === 'email' ? (
        <TextInput
          id="email"
          label={t.auth.emailLabel}
          leftSection={<AtSign size={18} />}
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t.auth.emailPlaceholder}
          required
          type="email"
          value={email}
        />
      ) : null}

      {step === 'code' ? (
        <Stack align="center" gap="xs">
          <Input.Label htmlFor="code">{t.auth.codeLabel}</Input.Label>
          <PinInput
            autoFocus
            disabled={isSubmitting}
            id="code"
            inputMode="numeric"
            length={4}
            name="code"
            onChange={onCodeChange}
            placeholder=""
            type="number"
            value={code}
          />
        </Stack>
      ) : null}

      {step === 'email' ? (
        <Button
          leftSection={<Mail size={18} />}
          loading={isSubmitting}
          type="submit"
        >
          {t.auth.continue}
        </Button>
      ) : null}

      {step === 'code' ? (
        <Alert color="green">{format(t.auth.codeSent, { email })}</Alert>
      ) : null}
      {isSubmitting && step === 'code' ? (
        <Text c="dimmed" size="sm" ta="center">
          Checking code...
        </Text>
      ) : null}
      {result?.ok === false ? <Alert color="red">{result.message}</Alert> : null}
        </Stack>
      </Card>
    </Stack>
  );
}

function waitForUiDelay() {
  return new Promise((resolve) => {
    setTimeout(resolve, UI_DELAY_MS);
  });
}
