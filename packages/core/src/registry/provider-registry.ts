import type { SecretProvider } from '../types/index.js';

type ProviderFactory = (config: Record<string, unknown>) => SecretProvider;

export class ProviderRegistry {
  private factories: Map<string, ProviderFactory> = new Map();

  /** Provider 팩토리 함수 등록 */
  register(name: string, factory: ProviderFactory): void {
    this.factories.set(name, factory);
  }

  /** 이미 등록된 Provider를 덮어쓰기 */
  override(name: string, factory: ProviderFactory): void {
    this.factories.set(name, factory);
  }

  /** Provider 등록 해제 */
  unregister(name: string): void {
    this.factories.delete(name);
  }

  /** 등록된 Provider 이름 목록 */
  list(): string[] {
    return [...this.factories.keys()];
  }

  /** 특정 Provider 이름이 등록되어 있는지 확인 */
  has(name: string): boolean {
    return this.factories.has(name);
  }

  /**
   * Provider 이름으로 인스턴스 생성.
   * 등록되지 않은 경우 에러를 던진다.
   */
  resolve(name: string, config: Record<string, unknown>): SecretProvider {
    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(
        `Provider '${name}'이 등록되지 않았습니다. 설치 후 등록하세요:\n` +
        `  npm install @apicenter/provider-${name}`,
      );
    }
    return factory(config);
  }
}

/** 전역 싱글톤 레지스트리 */
export const globalRegistry = new ProviderRegistry();
