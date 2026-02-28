// 시크릿 단건 항목
export interface SecretEntry {
  key: string;
  value: string;
  env?: string;
  source?: string;
  updatedAt?: Date;
}

// 시크릿 값
export type SecretValue = string | undefined;

// Provider 인증 설정
export type AuthConfig = Record<string, unknown>;

// 히스토리 항목
export interface SecretHistory {
  key: string;
  value: string;
  changedAt: Date;
  changedBy?: string;
}

// 모든 시크릿 Provider가 구현해야 하는 인터페이스
export interface SecretProvider {
  name: string;

  // 인증
  authenticate(config: AuthConfig): Promise<void>;
  isAuthenticated(): Promise<boolean>;

  // CRUD
  getSecret(key: string, env?: string): Promise<SecretValue>;
  listSecrets(env?: string): Promise<SecretEntry[]>;
  setSecret(key: string, value: string, env?: string): Promise<void>;
  deleteSecret(key: string, env?: string): Promise<void>;

  // 벌크 작업
  pullAll(env?: string): Promise<Record<string, string>>;
  pushAll(secrets: Record<string, string>, env?: string): Promise<void>;

  // 선택 구현 (Optional)
  getEnvironments?(): Promise<string[]>;
  getHistory?(key: string): Promise<SecretHistory[]>;
  rotateSecret?(key: string): Promise<string>;
}

// diff 결과 항목
export type DiffStatus = 'added' | 'removed' | 'changed' | 'synced';

export interface DiffEntry {
  key: string;
  status: DiffStatus;
  localValue?: string;
  remoteValue?: string;
}

// apicenter 에러 타입
export class ApicenterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ApicenterError';
  }
}

// 스캔 단건 매치 결과
export interface ScanMatch {
  key: string;
  file: string;
  line: number;
  language: string;
  provider?: string; // 값 패턴으로 탐지된 경우 provider명 (예: 'OpenAI', 'AWS')
}

// scan 명령어 전체 결과
export interface ScanResult {
  matches: ScanMatch[];
  uniqueKeys: string[];
  fileCount: number;
}
