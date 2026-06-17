import { AuthPanel } from './auth-panel'
import { Center } from '@mantine/core'

type SignedOutContentProps = {
  redirectTo?: string
}

export function SignedOutContent({ redirectTo }: SignedOutContentProps) {
  return (
    <Center>
      <AuthPanel redirectTo={redirectTo} />
    </Center>
  )
}
