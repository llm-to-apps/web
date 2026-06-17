import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off'
    }
  },
  {
    ignores: [
      '.next/**',
      '.next-e2e/**',
      'dist-worker/**',
      'node_modules/**',
      'ui-kit/**',
      'next-env.d.ts'
    ]
  }
]

export default eslintConfig
