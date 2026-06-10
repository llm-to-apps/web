import { randomBytes } from 'node:crypto';

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
  user: string;
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
  const user = projectUserName(projectId);
  const password = randomPassword();
  const name = 'app';

  await ensureProjectUser(user, password);
  const repository = await ensureRepository(user, password, name);
  const token = await createRepositoryToken(user, projectId);
  const cloneUrl = rewriteBaseUrl(
    repository.clone_url || `${forgejoUrl}/${user}/${name}.git`,
    forgejoGitUrl
  );

  return {
    owner: user,
    name,
    cloneUrl,
    authenticatedCloneUrl: withBasicAuth(cloneUrl, user, token),
    user
  };
}

export async function deleteProjectRepository(owner: string, name: string, user?: string) {
  const userToDelete = user || (owner !== forgejoAdminUser ? owner : null);
  const response = await forgejoFetch(
    `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    {
      method: 'DELETE'
    }
  );

  if (response.status === 404) {
    if (userToDelete) {
      await deleteProjectUser(userToDelete);
    }

    return {
      deleted: false
    };
  }

  if (!response.ok) {
    throw new Error(`Forgejo repository deletion failed: ${response.status}`);
  }

  if (userToDelete) {
    await deleteProjectUser(userToDelete);
  }

  return {
    deleted: true
  };
}

async function ensureProjectUser(username: string, password: string) {
  const response = await forgejoFetch('/api/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: `${username}@projects.local`,
      username,
      password,
      must_change_password: false,
      send_notify: false,
      visibility: 'private'
    })
  });

  if (response.status === 409 || response.status === 422) {
    return;
  }

  if (!response.ok) {
    throw new Error(`Forgejo project user creation failed: ${response.status}`);
  }
}

async function deleteProjectUser(username: string) {
  const response = await forgejoFetch(
    `/api/v1/admin/users/${encodeURIComponent(username)}?purge=true`,
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
    throw new Error(`Forgejo project user deletion failed: ${response.status}`);
  }

  return {
    deleted: true
  };
}

async function ensureRepository(username: string, password: string, name: string) {
  const response = await forgejoUserFetch(username, password, '/api/v1/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name,
      private: true,
      auto_init: false
    })
  });

  if (response.status === 409) {
    const existing = await forgejoFetch(
      `/api/v1/repos/${encodeURIComponent(username)}/${encodeURIComponent(name)}`
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

async function createRepositoryToken(username: string, projectId: string) {
  const response = await forgejoFetch(
    `/api/v1/users/${encodeURIComponent(username)}/tokens`,
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

function projectUserName(projectId: string) {
  return `project-${projectId}`;
}

function randomPassword() {
  return randomBytes(24).toString('base64url');
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

async function forgejoUserFetch(
  username: string,
  password: string,
  path: string,
  init: RequestInit = {}
) {
  return fetch(`${forgejoUrl}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
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
