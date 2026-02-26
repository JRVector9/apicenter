import { describe, it, expect } from 'vitest';
import { ApicenterError } from './index.js';

describe('ApicenterError', () => {
  it('code와 message를 가진 에러를 생성해야 한다', () => {
    const err = new ApicenterError('Provider not found', 'PROVIDER_NOT_FOUND');
    expect(err.message).toBe('Provider not found');
    expect(err.code).toBe('PROVIDER_NOT_FOUND');
    expect(err.name).toBe('ApicenterError');
  });

  it('Error를 상속해야 한다', () => {
    const err = new ApicenterError('test', 'TEST');
    expect(err).toBeInstanceOf(Error);
  });
});
