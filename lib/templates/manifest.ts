import Ajv2020, { type ErrorObject } from 'ajv/dist/2020';
import manifestSchema from './manifest.schema.json';

export type TemplateManifest = {
  schemaVersion: 1;
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  status: 'available' | 'coming_soon';
  sortOrder?: number;
  source: {
    repository: string;
    remote: string;
    path?: string;
  };
  git: {
    mount: {
      target: string;
      strategy: 'clone' | 'copy-template';
      defaultBranch?: string;
    };
  };
  image?: string;
  runtime: {
    workdir: string;
    appPort: number;
    agentPort: number;
    startupCommands?: string;
    appCommand?: string;
  };
  services: {
    mysql: {
      required: boolean;
      database: string;
    };
  };
  env: {
    template: Record<string, string>;
  };
};

const ajv = new Ajv2020({
  allErrors: true,
  strict: true
});

const validate = ajv.compile<TemplateManifest>(manifestSchema);

export function parseTemplateManifest(input: unknown): TemplateManifest {
  if (validate(input)) {
    return input;
  }

  throw new Error(formatManifestErrors(validate.errors ?? []));
}

export function templateManifestToAppTemplateFields(
  manifest: TemplateManifest,
  manifestUrl?: string
) {
  return {
    id: manifest.id,
    slug: manifest.slug,
    name: manifest.name,
    description: manifest.description,
    icon: manifest.icon,
    status: manifest.status,
    repository: manifest.source.repository,
    git: manifest.source.remote,
    image: manifest.image ?? null,
    appPort: manifest.runtime.appPort,
    agentPort: manifest.runtime.agentPort,
    sortOrder: manifest.sortOrder ?? 0,
    manifestUrl: manifestUrl ?? null,
    manifest
  };
}

function formatManifestErrors(errors: ErrorObject[]) {
  if (errors.length === 0) {
    return 'Template manifest is invalid';
  }

  return errors
    .map((error) => {
      const path = error.instancePath || '/';
      return `${path}: ${error.message ?? 'invalid value'}`;
    })
    .join('\n');
}
