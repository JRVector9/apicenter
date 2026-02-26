import { Args, Command } from '@oclif/core';
import { GlobalConfig } from '@apicenter/core';

export default class ConfigGet extends Command {
  static description = '전역 설정 값 조회';
  static examples = ['<%= config.bin %> config get default_provider'];

  static args = {
    key: Args.string({ description: '설정 키', required: true }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(ConfigGet);
    const cfg = new GlobalConfig();
    const value = cfg.get(args.key);

    if (value === undefined) {
      this.log(`(unset)`);
    } else {
      this.log(value);
    }
  }
}
