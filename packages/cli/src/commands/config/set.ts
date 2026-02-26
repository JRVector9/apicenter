import { Args, Command } from '@oclif/core';
import { GlobalConfig } from '@apicenter/core';

export default class ConfigSet extends Command {
  static description = '전역 설정 값 저장';
  static examples = ['<%= config.bin %> config set default_provider vault'];

  static args = {
    key: Args.string({ description: '설정 키', required: true }),
    value: Args.string({ description: '설정 값', required: true }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(ConfigSet);
    const cfg = new GlobalConfig();
    cfg.set(args.key, args.value);
    this.log(`✓ ${args.key} = ${args.value}`);
  }
}
