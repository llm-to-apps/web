import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL =
  'https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt';
const OUTPUT_PATH = '../data/slug-words.json';
const MAX_WORDS = 10_000;
const MIN_LENGTH = 4;
const MAX_LENGTH = 12;

const blockedWords = new Set([
  'admin',
  'agent',
  'apache',
  'api',
  'app',
  'auth',
  'blog',
  'cdn',
  'cloud',
  'config',
  'dashboard',
  'data',
  'database',
  'db',
  'demo',
  'dev',
  'docker',
  'email',
  'ftp',
  'git',
  'github',
  'google',
  'host',
  'imap',
  'internal',
  'localhost',
  'login',
  'mail',
  'manager',
  'mysql',
  'null',
  'ops',
  'pop',
  'portal',
  'prod',
  'root',
  'server',
  'smtp',
  'ssh',
  'static',
  'status',
  'support',
  'swarm',
  'system',
  'test',
  'tools',
  'traefik',
  'user',
  'web',
  'www',
  'xbox',
  'xerox',
  'yahoo',
  'youtube'
]);

const badFragments = [
  'anal',
  'anus',
  'arse',
  'ass',
  'bastard',
  'bitch',
  'boob',
  'cock',
  'crap',
  'cunt',
  'damn',
  'dick',
  'fart',
  'fuck',
  'hitler',
  'horny',
  'isis',
  'jihad',
  'nazi',
  'penis',
  'poop',
  'porn',
  'pussy',
  'rape',
  'sex',
  'shit',
  'slut',
  'tit',
  'trump',
  'vagina',
  'whore'
];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outputFile = resolve(scriptDir, OUTPUT_PATH);

const response = await fetch(SOURCE_URL);

if (!response.ok) {
  throw new Error(`Failed to fetch word list: ${response.status}`);
}

const words = (await response.text())
  .split(/\r?\n/)
  .map((line) => line.trim().toLowerCase().split(/\s+/).at(-1) ?? '')
  .filter(isUsableWord);

const uniqueWords = [...new Set(words)];
const selectedWords = uniqueWords
  .sort((left, right) => stableWordScore(left) - stableWordScore(right))
  .slice(0, MAX_WORDS)
  .sort();

if (selectedWords.length < 5_000) {
  throw new Error(`Only generated ${selectedWords.length} words`);
}

await mkdir(dirname(outputFile), { recursive: true });
await writeFile(
  outputFile,
  `${JSON.stringify(selectedWords, null, 2)}\n`
);

console.log(`Wrote ${selectedWords.length} words to ${outputFile}`);

function isUsableWord(word) {
  return (
    word.length >= MIN_LENGTH &&
    word.length <= MAX_LENGTH &&
    /^[a-z]+$/.test(word) &&
    !blockedWords.has(word) &&
    !badFragments.some((fragment) => word.includes(fragment)) &&
    !word.endsWith('ed') &&
    !word.endsWith('ing') &&
    !word.endsWith('ly') &&
    !word.endsWith('ness') &&
    !word.endsWith('tion') &&
    !word.endsWith('sion')
  );
}

function stableWordScore(word) {
  let hash = 2166136261;

  for (let index = 0; index < word.length; index += 1) {
    hash ^= word.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
