import {
  SecretsManagerClient,
  GetSecretValueCommand,
  CreateSecretCommand,
  PutSecretValueCommand,
  DeleteSecretCommand,
  ListSecretsCommand,
} from '@aws-sdk/client-secrets-manager';
import type { SecretProvider, AuthConfig, SecretEntry } from '@apicenter/core';

export type AwsMode = 'bundle' | 'individual';

export interface AwsConfig {
  region: string;
  prefix?: string;
  mode?: AwsMode;
}

/**
 * AwsProvider — AWS Secrets Manager 연동
 *
 * bundle mode (기본): 환경별로 하나의 시크릿 저장
 *   - 시크릿 이름: `{prefix}{env}`
 *   - 값: JSON 문자열 `{"KEY": "value", ...}`
 *
 * individual mode: 키별로 개별 시크릿 저장
 *   - 시크릿 이름: `{prefix}{key}`
 *   - 값: 평문 문자열
 */
export class AwsProvider implements SecretProvider {
  readonly name = 'aws';
  private client: SecretsManagerClient;
  private config: Required<AwsConfig>;

  constructor(config: AwsConfig) {
    if (!config.region) throw new Error('AwsProvider: config.region is required');
    this.config = { prefix: '', mode: 'bundle', ...config };
    this.client = new SecretsManagerClient({ region: this.config.region });
  }

  /** 테스트용 클라이언트 교체 */
  _setClient(client: SecretsManagerClient): void {
    this.client = client;
  }

  async authenticate(_config: AuthConfig): Promise<void> {
    // AWS credential chain이 자동 처리
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      await this.client.send(new ListSecretsCommand({ MaxResults: 1 }));
      return true;
    } catch {
      return false;
    }
  }

  async pullAll(env = 'dev'): Promise<Record<string, string>> {
    if (this.config.mode === 'bundle') {
      return this.readBundle(env);
    }
    return this.readIndividualAll();
  }

  async pushAll(secrets: Record<string, string>, env = 'dev'): Promise<void> {
    if (this.config.mode === 'bundle') {
      const existing = await this.readBundle(env);
      await this.writeBundle(env, { ...existing, ...secrets });
    } else {
      for (const [key, value] of Object.entries(secrets)) {
        await this.writeIndividual(key, value);
      }
    }
  }

  async getSecret(key: string, env = 'dev'): Promise<string | undefined> {
    const all = await this.pullAll(env);
    return all[key];
  }

  async listSecrets(env = 'dev'): Promise<SecretEntry[]> {
    const all = await this.pullAll(env);
    return Object.entries(all).map(([k, v]) => ({ key: k, value: v, env }));
  }

  async setSecret(key: string, value: string, env = 'dev'): Promise<void> {
    await this.pushAll({ [key]: value }, env);
  }

  async deleteSecret(key: string, env = 'dev'): Promise<void> {
    if (this.config.mode === 'bundle') {
      const existing = await this.readBundle(env);
      delete existing[key];
      await this.writeBundle(env, existing);
    } else {
      await this.client.send(
        new DeleteSecretCommand({
          SecretId: `${this.config.prefix}${key}`,
          ForceDeleteWithoutRecovery: true,
        }),
      );
    }
  }

  // ------- Bundle mode -------

  private async readBundle(env: string): Promise<Record<string, string>> {
    const secretId = `${this.config.prefix}${env}`;
    try {
      const resp = await this.client.send(new GetSecretValueCommand({ SecretId: secretId }));
      if (!resp.SecretString) return {};
      return JSON.parse(resp.SecretString) as Record<string, string>;
    } catch (err: unknown) {
      if (this.isNotFound(err)) return {};
      throw new Error(`AwsProvider: Failed to read bundle "${secretId}": ${String(err)}`);
    }
  }

  private async writeBundle(env: string, secrets: Record<string, string>): Promise<void> {
    const secretId = `${this.config.prefix}${env}`;
    const secretString = JSON.stringify(secrets);
    try {
      await this.client.send(new PutSecretValueCommand({ SecretId: secretId, SecretString: secretString }));
    } catch (err: unknown) {
      if (this.isNotFound(err)) {
        await this.client.send(new CreateSecretCommand({ Name: secretId, SecretString: secretString }));
      } else {
        throw new Error(`AwsProvider: Failed to write bundle "${secretId}": ${String(err)}`);
      }
    }
  }

  // ------- Individual mode -------

  private async readIndividualAll(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    let nextToken: string | undefined;
    do {
      const resp = await this.client.send(
        new ListSecretsCommand({ MaxResults: 100, NextToken: nextToken }),
      );
      for (const secret of resp.SecretList ?? []) {
        const name = secret.Name ?? '';
        if (!name.startsWith(this.config.prefix)) continue;
        const key = name.slice(this.config.prefix.length);
        try {
          const val = await this.client.send(new GetSecretValueCommand({ SecretId: name }));
          if (val.SecretString) result[key] = val.SecretString;
        } catch { /* skip unreadable secrets */ }
      }
      nextToken = resp.NextToken;
    } while (nextToken);
    return result;
  }

  private async writeIndividual(key: string, value: string): Promise<void> {
    const secretId = `${this.config.prefix}${key}`;
    try {
      await this.client.send(new PutSecretValueCommand({ SecretId: secretId, SecretString: value }));
    } catch (err: unknown) {
      if (this.isNotFound(err)) {
        await this.client.send(new CreateSecretCommand({ Name: secretId, SecretString: value }));
      } else {
        throw err;
      }
    }
  }

  private isNotFound(err: unknown): boolean {
    const name = (err as { name?: string }).name ?? '';
    const msg = String(err);
    return name === 'ResourceNotFoundException' || msg.includes('ResourceNotFoundException');
  }
}

export default AwsProvider;
