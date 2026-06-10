type ForgejoRepository = {
  clone_url?: string;
  default_branch?: string;
};

type ForgejoToken = {
  sha1?: string;
  token?: string;
};

export type ProjectRepository = {
  owner: string;
  name: string;
  cloneUrl: string;
  authenticatedCloneUrl: string;
};

const forgejoUrl = trimTrailingSlash(
  process.env.FORGEJO_URL || 'http://127.0.0.1:13002'
);
const forgejoGitUrl = trimTrailingSlash(process.env.FORGEJO_GIT_URL || forgejoUrl);
const forgejoAdminUser = process.env.FORGEJO_ADMIN_USER || 'root';
const forgejoAdminPassword = process.env.FORGEJO_ADMIN_PASSWORD || 'admin1234';

export async function createProjectRepository(
  projectId: string
): Promise<ProjectRepository> {
  const name = `project-${projectId}`;
  const repository = await ensureRepository(name);
  const token = await createRepositoryToken(projectId);
  const cloneUrl = rewriteBaseUrl(
    repository.clone_url || `${forgejoUrl}/${forgejoAdminUser}/${name}.git`,
    forgejoGitUrl
  );

  return {
    owner: forgejoAdminUser,
    name,
    cloneUrl,
    authenticatedCloneUrl: withBasicAuth(cloneUrl, forgejoAdminUser, token)
  };
}

export async function deleteProjectRepository(owner: string, name: string) {
  const response = await forgejoFetch(
    `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    {
      method: 'DELETE'
    }
  );

  if (response.status === 404) {
    return {
      deleted: false
    };
  }

  if (!response.ok) {
    throw new Error(`Forgejo repository deletion failed: ${response.status}`);
  }

  return {
    deleted: true
  };
}

async function ensureRepository(name: string) {
  const response = await forgejoFetch('/api/v1/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name,
      private: true,
      auto_init: false
    })
  });

  if (response.status === 409) {
    const existing = await forgejoFetch(
      `/api/v1/repos/${encodeURIComponent(forgejoAdminUser)}/${encodeURIComponent(name)}`
    );

    if (!existing.ok) {
      throw new Error(`Forgejo repository lookup failed: ${existing.status}`);
    }

    return (await existing.json()) as ForgejoRepository;
  }

  if (!response.ok) {
    throw new Error(`Forgejo repository creation failed: ${response.status}`);
  }

  return (await response.json()) as ForgejoRepository;
}

async function createRepositoryToken(projectId: string) {
  const response = await forgejoFetch(
    `/api/v1/users/${encodeURIComponent(forgejoAdminUser)}/tokens`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: `project-${projectId}-${Date.now()}`,
        scopes: ['write:repository']
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Forgejo token creation failed: ${response.status}`);
  }

  const payload = (await response.json()) as ForgejoToken;
  const token = payload.sha1 || payload.token;

  if (!token) {
    throw new Error('Forgejo token creation response did not include a token');
  }

  return token;
}

async function forgejoFetch(path: string, init: RequestInit = {}) {
  return fetch(`${forgejoUrl}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Basic ${Buffer.from(
        `${forgejoAdminUser}:${forgejoAdminPassword}`
      ).toString('base64')}`,
      'Content-Type': 'application/json'
    }
  });
}

function withBasicAuth(url: string, username: string, password: string) {
  const parsed = new URL(url);

  parsed.username = username;
  parsed.password = password;

  return parsed.toString();
}

function rewriteBaseUrl(url: string, baseUrl: string) {
  const parsed = new URL(url);
  const base = new URL(baseUrl);

  parsed.protocol = base.protocol;
  parsed.host = base.host;

  return parsed.toString();
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}
