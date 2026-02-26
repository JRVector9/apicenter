import { z } from 'zod';

export const SUPPORTED_PROVIDERS = ['dotenv', 'infisical', 'vault', 'aws', 'doppler', '1password'] as const;
export type ProviderName = typeof SUPPORTED_PROVIDERS[number];

export const ConfigSchema = z.object({
  version: z.literal('1'),
  provider: z.object({
    name: z.enum(SUPPORTED_PROVIDERS),
    config: z.record(z.unknown()).optional(),
  }),
  environments: z
    .record(
      z.object({
        provider_env: z.string(),
      }),
    )
    .optional(),
  default_env: z.string().optional(),
  groups: z
    .record(
      z.object({
        keys: z.array(z.string()),
      }),
    )
    .optional(),
  output: z
    .object({
      format: z.enum(['dotenv', 'json', 'yaml', 'toml']).default('dotenv'),
      path: z.string().default('.env.local'),
    })
    .optional(),
  scan: z
    .object({
      include: z.array(z.string()).optional(),
      exclude: z.array(z.string()).optional(),
      max_depth: z.number().optional(),
    })
    .optional(),
  security: z
    .object({
      mask_in_logs: z.boolean().default(true),
      confirm_before_push: z.boolean().default(true),
      gitignore_check: z.boolean().default(true),
    })
    .optional(),
});

export type ApicenterConfig = z.infer<typeof ConfigSchema>;
