import type {
  SecretProvider,
  SecretEntry,
  SecretValue,
  AuthConfig,
} from '@apicenter/core';

export interface InfisicalConfig {
  /** Infisical 프로젝트 ID */
  project_id: string;
  /** Infisical 서버 주소 (기본: https://app.infisical.com) */
  host?: string;
  /** Universal Auth — Client ID */
  client_id?: string;
  /** Universal Auth — Client Secret */
  client_secret?: string;
  /** Service Token (레거시, client_id/secret 우선) */
  token?: string;
}

export class InfisicalProvider implements SecretProvider {
  readonly name = 'infisical';
  private config: InfisicalConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;

  constructor(config: InfisicalConfig) {
    this.config = config;
  }

  async authenticate(_config: AuthConfig): Promise<void> {
    await this.ensureClient();
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      await this.ensureClient();
      return true;
    } catch {
      return false;
    }
  }

  async pullAll(env = 'dev'): Promise<Record<string, string>> {
    const client = await this.ensureClient();
    const secrets = await client.listSecrets({
      environment: env,
      projectId: this.config.project_id,
    });

    const result: Record<string, string> = {};
    for (const secret of secrets) {
      result[secret.secretKey] = secret.secretValue;
    }
    return result;
  }

  async pushAll(
    secrets: Record<string, string>,
    env = 'dev',
  ): Promise<void> {
    const client = await this.ensureClient();
    const existing = await this.pullAll(env);

    for (const [key, value] of Object.entries(secrets)) {
      if (existing[key] !== undefined) {
        await client.updateSecret({
          environment: env,
          projectId: this.config.project_id,
          secretName: key,
          secretValue: value,
        });
      } else {
        await client.createSecret({
          environment: env,
          projectId: this.config.project_id,
          secretName: key,
          secretValue: value,
        });
      }
    }
  }

  async getSecret(key: string, env = 'dev'): Promise<SecretValue> {
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
    const client = await this.ensureClient();
    await client.deleteSecret({
      environment: env,
      projectId: this.config.project_id,
      secretName: key,
    });
  }

  async getEnvironments(): Promise<string[]> {
    // Infisical SDK에서 환경 목록 조회 (SDK 버전에 따라 다를 수 있음)
    return ['dev', 'staging', 'prod'];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async ensureClient(): Promise<any> {
    if (this.client) return this.client;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let InfisicalSDK: any;
    try {
      const mod = await import('@infisical/sdk');
      InfisicalSDK = mod.InfisicalClient ?? mod.default;
    } catch {
      throw new Error(
        '@infisical/sdk 패키지가 설치되지 않았습니다.\n' +
        '설치: npm install @apicenter/provider-infisical @infisical/sdk',
      );
    }

    if (this.config.client_id && this.config.client_secret) {
      this.client = new InfisicalSDK({
        siteUrl: this.config.host ?? 'https://app.infisical.com',
        auth: {
          universalAuth: {
            clientId: this.config.client_id,
            clientSecret: this.config.client_secret,
          },
        },
      });
    } else if (this.config.token) {
      this.client = new InfisicalSDK({
        siteUrl: this.config.host ?? 'https://app.infisical.com',
        auth: {
          accessToken: this.config.token,
        },
      });
    } else {
      throw new Error(
        'Infisical 인증 설정이 없습니다. client_id/client_secret 또는 token을 apicenter.yaml에 설정하세요.',
      );
    }

    return this.client;
  }
}
