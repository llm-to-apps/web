'use client'

import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Box, Center, Loader, Stack, Transition } from '@mantine/core'
import { Os7Logo } from '../../ui-kit/src/os7-brand'
import { useSession } from './session-provider'

const MIN_SPLASH_MS = 800
const SPLASH_FADE_MS = 220

export function AppSplash({ children }: { children: ReactNode }) {
  const session = useSession()
  const [isVisible, setIsVisible] = useState(true)
  const startedAt = useRef(Date.now())

  useEffect(() => {
    if (session.status === 'loading' || !isVisible) {
      return
    }

    const elapsed = Date.now() - startedAt.current
    const delay = Math.max(0, MIN_SPLASH_MS - elapsed)
    const timer = window.setTimeout(() => {
      setIsVisible(false)
    }, delay)

    return () => {
      window.clearTimeout(timer)
    }
  }, [isVisible, session.status])

  return (
    <>
      {children}
      <Transition duration={SPLASH_FADE_MS} mounted={isVisible} transition="fade">
        {(styles) => (
          <Box
            bg="white"
            bottom={0}
            left={0}
            pos="fixed"
            right={0}
            style={{ ...styles, zIndex: 10000 }}
            top={0}
            w="100%"
          >
            <Center h="100%">
              <Stack align="center" gap="lg">
                <Os7Logo w={112} />
                <Loader size="xs" type="dots" />
              </Stack>
            </Center>
          </Box>
        )}
      </Transition>
    </>
  )
}
