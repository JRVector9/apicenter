import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { writeDotenvFile, readDotenvFile } from './dotenv-io.js';

describe('writeDotenvFile / readDotenvFile', () => {
  const testPath = '/tmp/apicenter-io-test.env';

  afterEach(() => {
    if (existsSync(testPath)) unlinkSync(testPath);
  });

  it('Record를 .env 파일로 저장해야 한다', () => {
    writeDotenvFile(testPath, { DB_HOST: 'localhost', PORT: '3000' });
    const result = readDotenvFile(testPath);
    expect(result['DB_HOST']).toBe('localhost');
    expect(result['PORT']).toBe('3000');
  });

  it('존재하지 않는 파일은 빈 객체를 반환해야 한다', () => {
    expect(readDotenvFile('/tmp/nonexistent_xyz.env')).toEqual({});
  });
});
