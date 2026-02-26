import yaml from 'js-yaml';
import { ConfigSchema, type ApicenterConfig } from './schema.js';
import { ApicenterError } from '../types/index.js';

export function parseConfig(content: string): ApicenterConfig {
  let raw: unknown;
  try {
    raw = yaml.load(content);
  } catch (e) {
    throw new ApicenterError(
      `apicenter.yaml 파싱 실패: ${(e as Error).message}`,
      'CONFIG_PARSE_ERROR',
    );
  }
  return validateConfig(raw);
}

export function validateConfig(raw: unknown): ApicenterConfig {
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const messages = result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new ApicenterError(
      `apicenter.yaml 설정 오류:\n${messages}`,
      'CONFIG_VALIDATION_ERROR',
    );
  }
  return result.data;
}
