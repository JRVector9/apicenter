import { zodToJsonSchema } from 'zod-to-json-schema';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import the built schema (must run `pnpm build` first)
const { ConfigSchema } = await import('../dist/config/schema.js');

const schema = zodToJsonSchema(ConfigSchema, {
  name: 'ApicenterConfig',
  $schema: 'http://json-schema.org/draft-07/schema#',
});

const outDir = join(__dirname, '../../../schemas');
mkdirSync(outDir, { recursive: true });

const outPath = join(outDir, 'apicenter.schema.json');
writeFileSync(outPath, JSON.stringify(schema, null, 2) + '\n');
console.log(`✓ Schema generated: ${outPath}`);
