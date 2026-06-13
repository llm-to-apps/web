'use client';

import { useFormStatus } from 'react-dom';

import { Button } from '../ui/button';

type WelcomeSubmitButtonProps = {
  children: string;
  loadingLabel: string;
};

export function WelcomeSubmitButton({
  children,
  loadingLabel
}: WelcomeSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button loading={pending} loadingLabel={loadingLabel} type="submit">
      {children}
    </Button>
  );
}
