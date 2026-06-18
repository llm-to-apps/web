type ProjectTemplateVersion = {
  templateId: string
  templateImage: string | null
}

type CurrentTemplateVersion = {
  id: string
  image: string | null
}

export type ProjectTemplateUpdate = {
  available: boolean
  currentImage: string | null
  latestImage: string | null
}

export function createTemplateImageMap(templates: CurrentTemplateVersion[]) {
  return new Map(templates.map((template) => [template.id, template.image]))
}

export function getProjectTemplateUpdate(
  project: ProjectTemplateVersion,
  latestImagesByTemplateId: Map<string, string | null>
): ProjectTemplateUpdate {
  const latestImage = latestImagesByTemplateId.get(project.templateId) ?? null
  const currentImage = project.templateImage

  return {
    available: Boolean(currentImage && latestImage && currentImage !== latestImage),
    currentImage,
    latestImage
  }
}
