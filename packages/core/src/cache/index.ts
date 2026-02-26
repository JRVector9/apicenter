import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir, hostname } from 'node:os';

const DEFAULT_CACHE_DIR = join(homedir(), '.config', 'apicenter', 'cache');
const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;
const SALT = Buffer.from('apicenter-cache-salt-v1');

function deriveKey(): Buffer {
  const password = `${process.env['USER'] ?? 'apicenter'}-${hostname()}`;
  return scryptSync(password, SALT, KEY_LEN) as Buffer;
}

export class SecretCache {
  private readonly cacheDir: string;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir ?? DEFAULT_CACHE_DIR;
  }

  save(provider: string, env: string, secrets: Record<string, string>): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }

    const key = deriveKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const plaintext = JSON.stringify(secrets);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf-8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Layout: [12 bytes IV][16 bytes authTag][N bytes encrypted]
    const payload = Buffer.concat([iv, authTag, encrypted]);
    writeFileSync(this.cacheFile(provider, env), payload);
  }

  load(provider: string, env: string): Record<string, string> | null {
    const file = this.cacheFile(provider, env);
    if (!existsSync(file)) return null;

    try {
      const payload = readFileSync(file);
      if (payload.length < 28) return null;

      const iv = payload.subarray(0, 12);
      const authTag = payload.subarray(12, 28);
      const encrypted = payload.subarray(28);

      const key = deriveKey();
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return JSON.parse(decrypted.toString('utf-8')) as Record<string, string>;
    } catch {
      return null;
    }
  }

  clear(provider: string, env: string): void {
    const file = this.cacheFile(provider, env);
    if (existsSync(file)) unlinkSync(file);
  }

  clearAll(): void {
    if (!existsSync(this.cacheDir)) return;
    for (const f of readdirSync(this.cacheDir)) {
      if (f.endsWith('.enc')) {
        unlinkSync(join(this.cacheDir, f));
      }
    }
  }

  private cacheFile(provider: string, env: string): string {
    return join(this.cacheDir, `${provider}-${env}.enc`);
  }
}
