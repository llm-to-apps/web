import {
  agentEmbeddingDimensions,
  agentEmbeddingModel,
  openRouterApiKey,
  openRouterBaseUrl
} from '@/server/env'

type OpenRouterEmbeddingResponse = {
  data?: Array<{
    embedding?: number[]
    index?: number
  }>
  model?: string
}

export type TextEmbedding = {
  embedding: number[]
  model: string
}

export async function embedTexts(texts: string[]): Promise<TextEmbedding[]> {
  if (texts.length === 0) {
    return []
  }

  const model = agentEmbeddingModel()
  const response = await fetch(`${openRouterBaseUrl()}/embeddings`, {
    body: JSON.stringify({
      dimensions: agentEmbeddingDimensions(),
      encoding_format: 'float',
      input: texts,
      model
    }),
    headers: {
      Authorization: `Bearer ${openRouterApiKey()}`,
      'Content-Type': 'application/json'
    },
    method: 'POST'
  })

  if (!response.ok) {
    throw new Error(`OpenRouter embeddings failed with status ${response.status}`)
  }

  const body = (await response.json()) as OpenRouterEmbeddingResponse
  const embeddings = body.data ?? []

  if (embeddings.length !== texts.length) {
    throw new Error(
      `OpenRouter returned ${embeddings.length} embeddings for ${texts.length} texts`
    )
  }

  return embeddings
    .slice()
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .map((item) => {
      if (!item.embedding) {
        throw new Error('OpenRouter embedding response is missing embedding data')
      }

      if (item.embedding.length !== agentEmbeddingDimensions()) {
        throw new Error(
          `OpenRouter returned ${item.embedding.length} dimensions, expected ${agentEmbeddingDimensions()}`
        )
      }

      return {
        embedding: item.embedding,
        model: body.model ?? model
      }
    })
}
