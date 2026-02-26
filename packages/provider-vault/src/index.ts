import type { SecretProvider, AuthConfig, SecretEntry } from '@apicenter/core';

export interface VaultConfig {
  address: string;
  token?: string;
  mount?: string;
  path_prefix?: string;
}

type ResolvedVaultConfig = VaultConfig & Required<Pick<VaultConfig, 'mount'>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NodeVaultClient = any;

async function createVaultClient(
  address: string,
  token: string,
): Promise<NodeVaultClient> {
  // Dynamic import keeps Vitest's vi.mock() hoisting able to intercept this module.
  // node-vault is CJS (export =); esModuleInterop gives us a .default property.
  const mod = await import('node-vault');
  const factory = (mod.default ?? mod) as (opts: unknown) => NodeVaultClient;
  return factory({ apiVersion: 'v1', endpoint: address, token });
}

export class VaultProvider implements SecretProvider {
  readonly name = 'vault';
  private clientPromise: Promise<NodeVaultClient> | null = null;
  private config: ResolvedVaultConfig;

  constructor(config: VaultConfig) {
    if (!config.address) {
      throw new Error('VaultProvider: config.address is required');
    }
    this.config = { mount: 'secret', ...config };
  }

  private getToken(): string {
    const token = this.config.token ?? process.env['VAULT_TOKEN'];
    if (!token) {
      throw new Error(
        'VaultProvider: No token provided. Set config.token or VAULT_TOKEN env var.',
      );
    }
    return token;
  }

  private getClient(): Promise<NodeVaultClient> {
    if (!this.clientPromise) {
      this.clientPromise = createVaultClient(
        this.config.address,
        this.getToken(),
      );
    }
    return this.clientPromise;
  }

  private buildPath(env: string): string {
    const parts = [this.config.path_prefix, env].filter(Boolean);
    return parts.join('/');
  }

  async authenticate(config: AuthConfig): Promise<void> {
    const token =
      (config as unknown as VaultConfig).token ?? process.env['VAULT_TOKEN'];
    if (token) this.config.token = token;
    // Reset cached client so next call picks up the new token
    this.clientPromise = createVaultClient(
      this.config.address,
      this.getToken(),
    );
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const client = await this.getClient();
      await client.tokenLookupSelf();
      return true;
    } catch {
      return false;
    }
  }

  async pullAll(env = 'dev'): Promise<Record<string, string>> {
    const client = await this.getClient();
    const path = `${this.config.mount}/data/${this.buildPath(env)}`;
    try {
      const response = await client.read(path);
      const data = (response as { data?: { data?: Record<string, string> } })
        ?.data?.data;
      return data ?? {};
    } catch (err: unknown) {
      const msg = String(err);
      if (msg.includes('404') || msg.includes('not found')) return {};
      throw new Error(
        `VaultProvider: Failed to pull secrets from ${path}: ${msg}`,
      );
    }
  }

  async pushAll(secrets: Record<string, string>, env = 'dev'): Promise<void> {
    const client = await this.getClient();
    const path = `${this.config.mount}/data/${this.buildPath(env)}`;
    try {
      await client.write(path, { data: secrets });
    } catch (err: unknown) {
      throw new Error(
        `VaultProvider: Failed to push secrets to ${path}: ${String(err)}`,
      );
    }
  }

  async getSecret(key: string, env = 'dev'): Promise<string | undefined> {
    const all = await this.pullAll(env);
    if (!(key in all)) {
      throw new Error(`VaultProvider: Key "${key}" not found`);
    }
    return all[key];
  }

  async listSecrets(env = 'dev'): Promise<SecretEntry[]> {
    const all = await this.pullAll(env);
    return Object.entries(all).map(([key, value]) => ({ key, value, env }));
  }

  async setSecret(key: string, value: string, env = 'dev'): Promise<void> {
    let existing: Record<string, string> = {};
    try {
      existing = await this.pullAll(env);
    } catch {
      // path may not exist yet; start with empty object
    }
    await this.pushAll({ ...existing, [key]: value }, env);
  }

  async deleteSecret(key: string, env = 'dev'): Promise<void> {
    const existing = await this.pullAll(env);
    if (!(key in existing)) {
      throw new Error(`VaultProvider: Key "${key}" not found — cannot delete.`);
    }
    const updated = { ...existing };
    delete updated[key];
    await this.pushAll(updated, env);
  }
}

export default VaultProvider;
