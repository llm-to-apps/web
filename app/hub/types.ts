export type HubAuthor = {
  id: string
  name: string
}

export type HubTopicListItem = {
  artifactCount: number
  author: HubAuthor
  category: string
  commentCount: number
  createdAt: string
  description: string | null
  downvoteCount: number
  id: string
  intent: string
  slug: string | null
  status: string
  tags: string[]
  title: string
  visibility: string
  translations: Record<
    string,
    {
      description: string | null
      intent: string
      title: string
    }
  >
  upvoteCount: number
  viewerHasDownvoted: boolean
  viewerHasUpvoted: boolean
}

export type HubTag = {
  category: string
  labels: Record<string, string>
  slug: string
}

export type HubArtifact = {
  author: HubAuthor
  commentCount: number
  createdAt: string
  description: string | null
  externalUrl: string | null
  file: {
    extraction: {
      content: string
      format: string
      metadata: unknown
    } | null
    id: string
    mimeType: string
    name: string
    sizeBytes: number
    status: string
    thumbnail: {
      id: string
      mimeType: string
      name: string
      sizeBytes: number
      status: string
    } | null
  } | null
  id: string
  slug: string | null
  status: string
  tagLabels: Record<string, Record<string, string>>
  tags: string[]
  textContent: string | null
  title: string
  translations: Record<
    string,
    {
      title: string
    }
  >
  type: string
}

export type HubComment = {
  artifactId: string | null
  author: HubAuthor
  body: string
  createdAt: string
  downvoteCount: number
  id: string
  parentId: string | null
  translations: Record<
    string,
    {
      body: string
    }
  >
  upvoteCount: number
  viewerHasDownvoted: boolean
  viewerHasUpvoted: boolean
}

export type HubTopicDetail = Omit<HubTopicListItem, 'artifactCount' | 'commentCount'> & {
  appUrl: string | null
  artifacts: HubArtifact[]
  comments: HubComment[]
  tagLabels: Record<string, Record<string, string>>
}
