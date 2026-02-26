import type { SecretProvider, SecretEntry, AuthConfig, SecretValue } from '@apicenter/core';

interface OnePasswordConfig {
  service_account_token?: string;
  vault: string;
  item_prefix?: string;
}

interface OpClient {
  vaults: { listAll(): AsyncIterable<{ id: string; name: string }> };
  items: {
    listAll(vaultId: string): AsyncIterable<{ id: string; title: string }>;
    get(vaultId: string, itemId: string): Promise<{
      id?: string;
      title?: string;
      fields?: Array<{ label?: string; value?: string | null }>;
    }>;
    create(item: {
      vaultId: string;
      title: string;
      category: string;
      fields: Array<{ label: string; value: string; fieldType: string }>;
    }): Promise<{ id: string }>;
    put(item: {
      id: string;
      vaultId: string;
      title: string;
      category: string;
      fields: Array<{ label: string; value: string; fieldType: string }>;
    }): Promise<{ id: string }>;
  };
}

export class OnePasswordProvider implements SecretProvider {
  name = '1password';
  private token: string;
  private vaultName: string;
  private itemPrefix: string;
  private client: OpClient | null = null;

  constructor(config: OnePasswordConfig) {
    this.token = config.service_account_token ?? process.env['OP_SERVICE_ACCOUNT_TOKEN'] ?? '';
    this.vaultName = config.vault;
    this.itemPrefix = config.item_prefix ?? '';
  }

  /** Inject mock client for testing */
  _setClient(client: OpClient): void {
    this.client = client;
  }

  private async getClient(): Promise<OpClient> {
    if (!this.client) {
      const { createClient } = await import('@1password/sdk');
      this.client = (await createClient({
        auth: this.token,
        integrationName: 'apicenter',
        integrationVersion: '0.1.0',
      })) as unknown as OpClient;
    }
    return this.client;
  }

  async authenticate(_config: AuthConfig): Promise<void> {
    await this.getClient();
  }

  async isAuthenticated(): Promise<boolean> {
    return this.client !== null;
  }

  private async findVaultId(client: OpClient): Promise<string | null> {
    for await (const vault of client.vaults.listAll()) {
      if (vault.name === this.vaultName) return vault.id;
    }
    return null;
  }

  private itemTitle(env: string): string {
    return this.itemPrefix ? `${this.itemPrefix}/${env}` : env;
  }

  private async findItem(
    client: OpClient,
    vaultId: string,
    title: string,
  ): Promise<{ id: string; title: string } | null> {
    for await (const item of client.items.listAll(vaultId)) {
      if (item.title === title) return item;
    }
    return null;
  }

  async pullAll(env?: string): Promise<Record<string, string>> {
    const client = await this.getClient();
    const targetEnv = env ?? 'dev';
    const title = this.itemTitle(targetEnv);

    const vaultId = await this.findVaultId(client);
    if (!vaultId) return {};

    const item = await this.findItem(client, vaultId, title);
    if (!item) return {};

    const full = await client.items.get(vaultId, item.id);
    const result: Record<string, string> = {};
    for (const field of full.fields ?? []) {
      if (field.label && field.value) {
        result[field.label] = String(field.value);
      }
    }
    return result;
  }

  async pushAll(secrets: Record<string, string>, env?: string): Promise<void> {
    const client = await this.getClient();
    const targetEnv = env ?? 'dev';
    const title = this.itemTitle(targetEnv);

    const vaultId = await this.findVaultId(client);
    if (!vaultId) throw new Error(`Vault '${this.vaultName}' not found in 1Password`);

    const fields = Object.entries(secrets).map(([label, value]) => ({
      label,
      value,
      fieldType: 'CONCEALED',
    }));

    const existing = await this.findItem(client, vaultId, title);
    if (existing) {
      await client.items.put({ id: existing.id, vaultId, title, category: 'LOGIN', fields });
    } else {
      await client.items.create({ vaultId, title, category: 'LOGIN', fields });
    }
  }

  async getSecret(key: string, env?: string): Promise<SecretValue> {
    const secrets = await this.pullAll(env);
    return secrets[key];
  }

  async listSecrets(env?: string): Promise<SecretEntry[]> {
    const secrets = await this.pullAll(env);
    return Object.entries(secrets).map(([key, value]) => ({
      key,
      value,
      env: env ?? 'dev',
    }));
  }

  async setSecret(key: string, value: string, env?: string): Promise<void> {
    const existing = await this.pullAll(env);
    await this.pushAll({ ...existing, [key]: value }, env);
  }

  async deleteSecret(key: string, env?: string): Promise<void> {
    const existing = await this.pullAll(env);
    const updated = Object.fromEntries(
      Object.entries(existing).filter(([k]) => k !== key),
    );
    await this.pushAll(updated, env);
  }
}
