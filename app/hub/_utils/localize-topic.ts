import type { HubTopicListItem } from '@/app/hub/types'

type LocalizableHubTopic = Pick<
  HubTopicListItem,
  'description' | 'intent' | 'title' | 'translations'
>

export function localizeHubTopic<T extends LocalizableHubTopic>(
  topic: T,
  locale: string
) {
  const translation = topic.translations[locale] ?? topic.translations.en

  return {
    description: translation?.description ?? topic.description,
    intent: translation?.intent || topic.intent,
    title: translation?.title || topic.title
  }
}
