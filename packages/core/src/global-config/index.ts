import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_CONFIG_DIR = join(homedir(), '.config', 'apicenter');

export class GlobalConfig {
  private readonly configFile: string;
  private readonly configDir: string;
  private data: Record<string, string> = {};

  constructor(configDir?: string) {
    this.configDir = configDir ?? DEFAULT_CONFIG_DIR;
    this.configFile = join(this.configDir, 'config.json');
    this.load();
  }

  private load(): void {
    if (!existsSync(this.configFile)) {
      this.data = {};
      return;
    }
    try {
      this.data = JSON.parse(readFileSync(this.configFile, 'utf-8')) as Record<string, string>;
    } catch {
      this.data = {};
    }
  }

  private save(): void {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }
    writeFileSync(this.configFile, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  get(key: string): string | undefined {
    return this.data[key];
  }

  set(key: string, value: string): void {
    this.data[key] = value;
    this.save();
  }

  delete(key: string): void {
    delete this.data[key];
    this.save();
  }

  list(): Record<string, string> {
    return { ...this.data };
  }
}
