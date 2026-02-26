import type { SecretProvider, AuthConfig, SecretEntry } from '@apicenter/core';

export interface DopplerConfig {
  token?: string;       // DOPPLER_TOKEN env var fallback
  project: string;
  config?: string;      // Doppler config name (maps to environment), default: "dev"
}

type FetchFn = typeof globalThis.fetch;

interface DopplerSecretValue {
  raw: string;
  computed: string;
}

interface DopplerListResponse {
  secrets: Record<string, DopplerSecretValue>;
}

/**
 * DopplerProvider — Doppler REST API v3 연동 (외부 의존성 없음)
 * 인증: Bearer 토큰 (config.token 또는 DOPPLER_TOKEN 환경변수)
 */
export class DopplerProvider implements SecretProvider {
  readonly name = 'doppler';
  private config: DopplerConfig;
  private _fetch: FetchFn;
  private static BASE_URL = 'https://api.doppler.com/v3';

  constructor(config: DopplerConfig) {
    if (!config.project) throw new Error('DopplerProvider: config.project is required');
    this.config = { config: 'dev', ...config };
    this._fetch = globalThis.fetch.bind(globalThis);
  }

  /** 테스트용 fetch 주입 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _setFetch(fn: any): void {
    this._fetch = fn as FetchFn;
  }

  private getToken(): string {
    const token = this.config.token ?? process.env['DOPPLER_TOKEN'];
    if (!token) {
      throw new Error('DopplerProvider: No token provided. Set config.token or DOPPLER_TOKEN env var.');
    }
    return token;
  }

  private getConfig(env?: string): string {
    return env ?? this.config.config ?? 'dev';
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.getToken()}`,
      'Content-Type': 'application/json',
    };
  }

  async authenticate(_config: AuthConfig): Promise<void> {
    const token = (_config as unknown as DopplerConfig).token;
    if (token) this.config.token = token;
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const url = `${DopplerProvider.BASE_URL}/me`;
      const resp = await this._fetch(url, { headers: this.authHeaders() });
      return resp.ok;
    } catch {
      return false;
    }
  }

  async pullAll(env?: string): Promise<Record<string, string>> {
    const cfg = this.getConfig(env);
    const url = new URL(`${DopplerProvider.BASE_URL}/configs/config/secrets`);
    url.searchParams.set('project', this.config.project);
    url.searchParams.set('config', cfg);

    const resp = await this._fetch(url.toString(), { headers: this.authHeaders() });
    if (!resp.ok) {
      throw new Error(`DopplerProvider: pullAll failed (${resp.status}): ${await resp.text()}`);
    }

    const body = (await resp.json()) as DopplerListResponse;
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(body.secrets)) {
      result[key] = val.computed;
    }
    return result;
  }

  async pushAll(secrets: Record<string, string>, env?: string): Promise<void> {
    const cfg = this.getConfig(env);
    const url = new URL(`${DopplerProvider.BASE_URL}/configs/config/secrets`);
    url.searchParams.set('project', this.config.project);
    url.searchParams.set('config', cfg);

    // Doppler expects: { secrets: { KEY: { value: "..." } } }
    const payload: Record<string, { value: string }> = {};
    for (const [key, val] of Object.entries(secrets)) {
      payload[key] = { value: val };
    }

    const resp = await this._fetch(url.toString(), {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ secrets: payload }),
    });

    if (!resp.ok) {
      throw new Error(`DopplerProvider: pushAll failed (${resp.status}): ${await resp.text()}`);
    }
  }

  async getSecret(key: string, env?: string): Promise<string | undefined> {
    const cfg = this.getConfig(env);
    const url = new URL(`${DopplerProvider.BASE_URL}/configs/config/secret`);
    url.searchParams.set('project', this.config.project);
    url.searchParams.set('config', cfg);
    url.searchParams.set('name', key);

    const resp = await this._fetch(url.toString(), { headers: this.authHeaders() });
    if (resp.status === 404) return undefined;
    if (!resp.ok) {
      throw new Error(`DopplerProvider: getSecret failed (${resp.status}): ${await resp.text()}`);
    }

    const body = (await resp.json()) as { secret: DopplerSecretValue };
    return body.secret.computed;
  }

  async listSecrets(env?: string): Promise<SecretEntry[]> {
    const all = await this.pullAll(env);
    return Object.entries(all).map(([key, value]) => ({ key, value, env: this.getConfig(env) }));
  }

  async setSecret(key: string, value: string, env?: string): Promise<void> {
    await this.pushAll({ [key]: value }, env);
  }

  async deleteSecret(key: string, env?: string): Promise<void> {
    const cfg = this.getConfig(env);
    const url = new URL(`${DopplerProvider.BASE_URL}/configs/config/secret`);
    url.searchParams.set('project', this.config.project);
    url.searchParams.set('config', cfg);
    url.searchParams.set('name', key);

    const resp = await this._fetch(url.toString(), {
      method: 'DELETE',
      headers: this.authHeaders(),
    });

    if (!resp.ok) {
      throw new Error(`DopplerProvider: deleteSecret failed (${resp.status}): ${await resp.text()}`);
    }
  }
}

export default DopplerProvider;
