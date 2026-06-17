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
      preserve?: string[];
    };
  };
  image?: string;
  runtime: {
    workdir: string;
    appPort: number;
    agentPort: number;
    devPort?: number;
    startupCommands?: string;
    restoreCommand?: string;
  };
  resources?: {
    memory?: {
      reservationMb?: number;
      limitMb?: number;
    };
    cpu?: {
      reservation?: number;
      limit?: number;
    };
  };
  services: {
    mysql?: {
      required: boolean;
      database: string;
    };
    oauth?: {
      required: boolean;
    };
  };
  env: {
    template: Record<string, string>;
  };
};

export type TemplateEnvContext = {
  app?: {
    projectId: string;
    publicUrl: string;
  };
  services?: {
    mysql?: {
      database: string;
      user: string;
      password: string;
    };
    oauth?: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      issuerUrl: string;
      authorizeUrl: string;
      tokenUrl: string;
      userinfoUrl: string;
      internalTokenUrl: string;
      internalUserinfoUrl: string;
      internalProjectUserTokenIntrospectionUrl: string;
      projectUserTokenIntrospectionUrl: string;
      projectServiceApiToken: string;
      projectServiceApiBaseUri: string;
      requestHost: string;
    };
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

export function renderTemplateEnv(
  manifest: TemplateManifest,
  context: TemplateEnvContext
) {
  return Object.fromEntries(
    Object.entries(manifest.env.template).map(([key, value]) => [
      key,
      renderTemplateValue(value, context)
    ])
  );
}

function renderTemplateValue(value: string, context: TemplateEnvContext) {
  return value.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, path) => {
    const resolvedValue = readPath(context, String(path));

    if (typeof resolvedValue !== 'string') {
      throw new Error(`Template env value references unknown path: ${path}`);
    }

    return resolvedValue;
  });
}

function readPath(input: unknown, path: string) {
  return path.split('.').reduce<unknown>((currentValue, key) => {
    if (
      currentValue &&
      typeof currentValue === 'object' &&
      key in currentValue
    ) {
      return (currentValue as Record<string, unknown>)[key];
    }

    return undefined;
  }, input);
}
