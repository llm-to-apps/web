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
import { LogIn } from 'lucide-react'
import { AuthPanel } from './auth-panel'
import { ModalTitle } from './modal-title'
import { useSession } from './session-provider'

type AuthModalContextValue = {
  openAuthModal: () => void
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null)

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const session = useSession()
  const [opened, setOpened] = useState(false)

  const openAuthModal = useCallback(() => {
    setOpened(true)
  }, [])

  const closeAuthModal = useCallback(() => {
    setOpened(false)
  }, [])

  useEffect(() => {
    if (session.status === 'authenticated') {
      closeAuthModal()
    }
  }, [closeAuthModal, session.status])

  const value = useMemo(
    () => ({
      openAuthModal
    }),
    [openAuthModal]
  )

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      <Modal
        centered
        onClose={closeAuthModal}
        opened={opened}
        size="sm"
        title={
          <ModalTitle icon={<LogIn size={16} />}>Sign in to continue</ModalTitle>
        }
        withCloseButton
      >
        <AuthPanel onAuthenticated={closeAuthModal} redirectTo="/hub" variant="plain" />
      </Modal>
    </AuthModalContext.Provider>
  )
}

export function useAuthModal() {
  const value = useContext(AuthModalContext)

  if (!value) {
    throw new Error('useAuthModal must be used inside AuthModalProvider')
  }

  return value
}
