import type { HubComment } from '@/app/hub/types'

export function localizeHubComment(comment: HubComment, locale: string) {
  const translation = comment.translations[locale] ?? comment.translations.en

  return {
    body: translation?.body || comment.body
  }
}
