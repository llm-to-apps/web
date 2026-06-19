import type { HubArtifact } from '@/app/hub/types'

type LocalizableHubArtifact = Pick<HubArtifact, 'title' | 'translations'>

export function localizeHubArtifact<T extends LocalizableHubArtifact>(
  artifact: T,
  locale: string
) {
  const translation = artifact.translations[locale] ?? artifact.translations.en

  return {
    title: translation?.title || artifact.title
  }
}
