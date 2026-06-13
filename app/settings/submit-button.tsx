'use client';

import { useFormStatus } from 'react-dom';

import { Button } from '../ui/button';

type SettingsSubmitButtonProps = {
  children: string;
  loadingLabel: string;
};

export function SettingsSubmitButton({
  children,
  loadingLabel
}: SettingsSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button loading={pending} loadingLabel={loadingLabel} type="submit">
      {children}
    </Button>
  );
}
