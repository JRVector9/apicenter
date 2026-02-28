import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type {
  SecretProvider,
  SecretEntry,
  SecretValue,
  AuthConfig,
} from '@apicenter/core';

interface DotenvConfig {
  path: string;
}

export class DotenvProvider implements SecretProvider {
  readonly name = 'dotenv';
  private filePath: string;

  constructor(config: DotenvConfig) {
    this.filePath = config.path;
  }

  async authenticate(_config: AuthConfig): Promise<void> {
    // dotenv는 인증 불필요
  }

  async isAuthenticated(): Promise<boolean> {
    return true;
  }

  async pullAll(_env?: string): Promise<Record<string, string>> {
    if (!existsSync(this.filePath)) return {};
    const content = readFileSync(this.filePath, 'utf-8');
    return this.parseEnvContent(content);
  }

  async pushAll(secrets: Record<string, string>, _env?: string): Promise<void> {
    const existing = await this.pullAll();
    const merged = { ...existing, ...secrets };
    const content = this.serializeToEnv(merged);
    writeFileSync(this.filePath, content, 'utf-8');
  }

  async getSecret(key: string, _env?: string): Promise<SecretValue> {
    const all = await this.pullAll();
    return all[key];
  }

  async listSecrets(_env?: string): Promise<SecretEntry[]> {
    const all = await this.pullAll();
    return Object.entries(all).map(([key, value]) => ({
      key,
      value,
      source: this.filePath,
    }));
  }

  async setSecret(key: string, value: string, _env?: string): Promise<void> {
    await this.pushAll({ [key]: value });
  }

  async deleteSecret(key: string, _env?: string): Promise<void> {
    const all = await this.pullAll();
    delete all[key];
    const content = this.serializeToEnv(all);
    writeFileSync(this.filePath, content, 'utf-8');
  }

  private parseEnvContent(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }
      if (key) result[key] = value;
    }
    return result;
  }

  private serializeToEnv(secrets: Record<string, string>): string {
    return (
      Object.entries(secrets)
        .filter(([key]) => key.length > 0 && !key.includes('='))
        .map(([key, value]) => {
          const needsQuote = /[\s#"'\\]/.test(value);
          const formatted = needsQuote ? `"${value.replace(/"/g, '\\"')}"` : value;
          return `${key}=${formatted}`;
        })
        .join('\n') + '\n'
    );
  }
}
