export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export class SecureLogger {
  private sensitiveValues: Set<string> = new Set();

  /** 마스킹할 시크릿 값 등록 */
  register(value: string): void {
    if (value.length >= 4) {
      this.sensitiveValues.add(value);
    }
  }

  /** 등록된 모든 시크릿을 *** 로 치환 */
  mask(text: string): string {
    let masked = text;
    for (const secret of this.sensitiveValues) {
      const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      masked = masked.replaceAll(new RegExp(escaped, 'g'), '***');
    }
    return masked;
  }

  /** 등록된 시크릿 초기화 */
  clear(): void {
    this.sensitiveValues.clear();
  }

  /** 마스킹 후 콘솔 출력 */
  log(level: LogLevel, message: string): void {
    const safe = this.mask(message);
    console[level](safe);
  }
}
