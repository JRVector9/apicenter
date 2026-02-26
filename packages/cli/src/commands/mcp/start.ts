import { Command } from '@oclif/core';
import { startServer } from '@apicenter/mcp-server';

export default class McpStart extends Command {
  static description = 'Claude Code용 MCP 서버 시작 (stdio 모드)';
  static examples = [
    '<%= config.bin %> mcp start',
  ];

  async run(): Promise<void> {
    await startServer(process.cwd());
  }
}
