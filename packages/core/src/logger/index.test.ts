import { describe, it, expect } from 'vitest';
import { SecureLogger } from './index.js';

describe('SecureLogger', () => {
  it('등록된 시크릿 값을 ***로 마스킹해야 한다', () => {
    const logger = new SecureLogger();
    logger.register('supersecret123');
    const result = logger.mask('DB_PASSWORD=supersecret123');
    expect(result).toBe('DB_PASSWORD=***');
    expect(result).not.toContain('supersecret123');
  });

  it('여러 시크릿을 모두 마스킹해야 한다', () => {
    const logger = new SecureLogger();
    logger.register('password1');
    logger.register('apikey2');
    const result = logger.mask('pw=password1 key=apikey2');
    expect(result).toBe('pw=*** key=***');
  });

  it('4자 미만 값은 등록되지 않아야 한다 (오탐 방지)', () => {
    const logger = new SecureLogger();
    logger.register('abc');
    const result = logger.mask('abc is short');
    expect(result).toBe('abc is short');
  });

  it('빈 문자열을 안전하게 처리해야 한다', () => {
    const logger = new SecureLogger();
    const result = logger.mask('');
    expect(result).toBe('');
  });

  it('clear() 호출 시 모든 시크릿이 제거되어야 한다', () => {
    const logger = new SecureLogger();
    logger.register('mysecret');
    logger.clear();
    const result = logger.mask('value=mysecret');
    expect(result).toBe('value=mysecret');
  });
});
