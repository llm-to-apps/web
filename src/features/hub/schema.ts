import { z } from 'zod'

const topicCategorySchema = z.enum(['personal', 'business'])
export const minHubTopicIntentLength = 256
export const maxHubTopicIntentLength = 12000

export const createHubTopicSchema = z.object({
  category: topicCategorySchema.default('personal'),
  intent: z
    .string()
    .trim()
    .min(
      minHubTopicIntentLength,
      `Intent must be at least ${minHubTopicIntentLength} characters`
    )
    .max(maxHubTopicIntentLength),
  tags: z
    .array(z.string().trim().min(1).max(40))
    .max(8)
    .default([])
    .transform((tags) => [...new Set(tags.map((tag) => normalizeTag(tag)))]),
  title: z.string().trim().max(160).optional()
})

export const createHubCommentSchema = z.object({
  artifactId: z.string().trim().min(1).optional().nullable(),
  body: z.string().trim().min(1, 'Comment is required').max(5000),
  parentId: z.string().trim().min(1).optional().nullable()
})

export function normalizeTag(tag: string) {
  return tag.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 40)
}

export function parseArtifactType(value: FormDataEntryValue | null) {
  const type = typeof value === 'string' ? value : ''

  if (type === 'text' || type === 'link' || type === 'file') {
    return type
  }

  return null
}

export function formText(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}
