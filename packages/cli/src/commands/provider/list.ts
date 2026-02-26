import { Command } from '@oclif/core';

const ALL_PROVIDERS = ['dotenv', 'infisical', 'vault', 'aws', 'doppler', '1password'] as const;

export default class ProviderList extends Command {
  static description = '설치된 Secret Provider 목록 확인';
  static examples = ['<%= config.bin %> provider list'];

  async run(): Promise<void> {
    this.log('Secret Providers:\n');
    this.log('  Built-in:');
    this.log('    ✓ dotenv');
    this.log('');
    this.log('  External (npm install @apicenter/provider-<name>):');

    for (const name of ALL_PROVIDERS.filter((n) => n !== 'dotenv')) {
      const installed = await this.isInstalled(name);
      const icon = installed ? '✓' : '○';
      const hint = installed ? '' : '  (not installed)';
      this.log(`    ${icon} ${name}${hint}`);
    }
  }

  private async isInstalled(name: string): Promise<boolean> {
    try {
      await import(`@apicenter/provider-${name}`);
      return true;
    } catch {
      return false;
    }
  }
}
