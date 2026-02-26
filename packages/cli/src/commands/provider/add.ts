import { Args, Command } from '@oclif/core';

const ALL_PROVIDERS = ['infisical', 'vault', 'aws', 'doppler', '1password'];

export default class ProviderAdd extends Command {
  static description = 'Provider 설치 안내';
  static examples = ['<%= config.bin %> provider add vault'];

  static args = {
    name: Args.string({ description: 'Provider 이름', required: true }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(ProviderAdd);

    if (!ALL_PROVIDERS.includes(args.name)) {
      this.error(
        `알 수 없는 provider: ${args.name}\n사용 가능: ${ALL_PROVIDERS.join(', ')}`,
        { exit: 1 },
      );
    }

    const pkg = `@apicenter/provider-${args.name}`;
    this.log(`\n📦 ${pkg} 설치 방법:\n`);
    this.log(`  npm:  npm install ${pkg}`);
    this.log(`  pnpm: pnpm add ${pkg}`);
    this.log(`  yarn: yarn add ${pkg}`);
    this.log(`\n설치 후 apicenter.yaml의 provider.name을 "${args.name}"으로 변경하세요.`);
  }
}
