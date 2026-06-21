'use client'

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'
import { Modal } from '@mantine/core'
import { LogIn, Sparkles } from 'lucide-react'
import { AuthPanel } from './auth-panel'
import { useI18n } from './i18n-provider'
import { ModalTitle } from '@/ui-kit/src/modal-title'
import { OnboardingForm } from './onboarding-form'
import { useSession } from './session-provider'

type AuthFlowContextValue = {
  openAuthFlow: (options?: AuthFlowOptions) => void
}

type AuthFlowOptions = {
  onReady?: () => void
}

type AuthFlowState =
  | {
      status: 'closed'
    }
  | {
      onReady?: () => void
      status: 'auth' | 'onboarding'
    }

const AuthFlowContext = createContext<AuthFlowContextValue | null>(null)

export function AuthFlowProvider({ children }: { children: ReactNode }) {
  const session = useSession()
  const { t } = useI18n()
  const [flow, setFlow] = useState<AuthFlowState>({ status: 'closed' })

  const closeAuthFlow = useCallback(() => {
    setFlow({ status: 'closed' })
  }, [])

  const completeAuthFlow = useCallback(() => {
    const onReady = flow.status === 'closed' ? undefined : flow.onReady

    setFlow({ status: 'closed' })
    onReady?.()
  }, [flow])

  const openAuthFlow = useCallback(
    (options?: AuthFlowOptions) => {
      if (session.status === 'authenticated') {
        if (session.data.user.onboarded) {
          options?.onReady?.()
          return
        }

        setFlow({
          onReady: options?.onReady,
          status: 'onboarding'
        })
        return
      }

      setFlow({
        onReady: options?.onReady,
        status: 'auth'
      })
    },
    [session]
  )

  useEffect(() => {
    if (flow.status === 'closed' || session.status !== 'authenticated') {
      return
    }

    if (session.data.user.onboarded) {
      completeAuthFlow()
      return
    }

    if (flow.status === 'auth') {
      setFlow({
        onReady: flow.onReady,
        status: 'onboarding'
      })
    }
  }, [completeAuthFlow, flow, session])

  const value = useMemo(
    () => ({
      openAuthFlow
    }),
    [openAuthFlow]
  )
  const needsOnboarding = flow.status === 'onboarding'

  return (
    <AuthFlowContext.Provider value={value}>
      {children}
      <Modal
        centered
        onClose={closeAuthFlow}
        opened={flow.status !== 'closed'}
        size={needsOnboarding ? 'lg' : 'sm'}
        title={
          needsOnboarding ? (
            <ModalTitle icon={<Sparkles size={16} />}>{t.welcome.title}</ModalTitle>
          ) : (
            <ModalTitle icon={<LogIn size={16} />}>{t.auth.signInToContinue}</ModalTitle>
          )
        }
        withCloseButton
      >
        {needsOnboarding && session.status === 'authenticated' ? (
          <OnboardingForm
            frame="plain"
            onCompleted={completeAuthFlow}
            session={session.data}
            showHeader={false}
          />
        ) : (
          <AuthPanel
            onAuthenticated={() => undefined}
            redirectTo="/hub"
            variant="plain"
          />
        )}
      </Modal>
    </AuthFlowContext.Provider>
  )
}

export function useAuthFlow() {
  const value = useContext(AuthFlowContext)

  if (!value) {
    throw new Error('useAuthFlow must be used inside AuthFlowProvider')
  }

  return value
}
