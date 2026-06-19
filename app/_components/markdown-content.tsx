import type { CSSProperties } from 'react'
import { Anchor, Box } from '@mantine/core'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import styles from './markdown-content.module.css'

type MarkdownContentProps = {
  content: string
  size?: 'sm' | 'md'
}

const sizeVars: Record<NonNullable<MarkdownContentProps['size']>, CSSProperties> = {
  md: { '--markdown-font-size': 'var(--mantine-font-size-md)' } as CSSProperties,
  sm: { '--markdown-font-size': 'var(--mantine-font-size-sm)' } as CSSProperties
}

export function MarkdownContent({ content, size = 'sm' }: MarkdownContentProps) {
  return (
    <Box className={styles.root} style={sizeVars[size]}>
      <ReactMarkdown
        components={{
          a: ({ children, href }) => (
            <Anchor href={href} rel="noreferrer" target="_blank">
              {children}
            </Anchor>
          ),
          code: ({ children, className }) => {
            if (className) {
              return (
                <pre className={styles.codeBlock}>
                  <code className={className}>{children}</code>
                </pre>
              )
            }

            return <code className={styles.inlineCode}>{children}</code>
          },
          pre: ({ children }) => <>{children}</>
        }}
        remarkPlugins={[remarkGfm]}
      >
        {content}
      </ReactMarkdown>
    </Box>
  )
}
