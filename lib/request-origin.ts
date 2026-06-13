import { platformBaseUrl } from './env';

export function publicRequestOrigin() {
  return platformBaseUrl();
}

export { platformBaseUrl };
