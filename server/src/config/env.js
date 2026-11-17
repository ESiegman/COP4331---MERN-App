import { z } from 'zod';

// An optional setting left empty (as compose passes an unset variable) counts as not set
const optional = (type) => z.preprocess((value) => (value === '' ? undefined : value), type.optional());

// Every environment variable the API reads is declared here and checked once at startup,
// so a missing or malformed value stops the server with a clear message instead of failing later.
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5001),
    MONGODB_URI: z.string().min(1).optional(),
    JWT_SECRET: z.string({ error: 'is required' }).min(1, 'is required'),
    JWT_EXPIRES_IN: z.string().default('7d'),
    // Where the web app is served. Verification and password reset emails link to it.
    APP_URL: z
      .url()
      .default('http://localhost:5173')
      .transform((url) => url.replace(/\/$/, '')),
    // Sends real email through any provider's SMTP server, for example
    // smtps://USER:PASSWORD@smtp.example.com:465. Without it, no email is sent.
    SMTP_URL: optional(z.url({ protocol: /^smtps?$/, error: 'must be an smtp:// or smtps:// URL' })),
    // Who emails come from. Most providers only accept an address on a domain you verified with them.
    EMAIL_FROM: optional(z.string().min(3)),
    // Claude API key for AI item suggestions. Without it, POST /templates/suggest-items answers 501.
    ANTHROPIC_API_KEY: optional(z.string().min(1)),
    // Only needed if "enhanced push security" is turned on for the project in Expo's dashboard
    EXPO_ACCESS_TOKEN: optional(z.string().min(1)),
    // Log in with Google and Discord. A provider without both its id and secret answers 501.
    GOOGLE_CLIENT_ID: optional(z.string().min(1)),
    GOOGLE_CLIENT_SECRET: optional(z.string().min(1)),
    DISCORD_CLIENT_ID: optional(z.string().min(1)),
    DISCORD_CLIENT_SECRET: optional(z.string().min(1)),
    // Comma-separated redirect URIs clients may use for Google and Discord login.
    // Defaults to APP_URL/oauth/callback.
    OAUTH_REDIRECT_URIS: optional(
      z
        .string()
        .transform((list) => list.split(',').map((uri) => uri.trim()).filter(Boolean))
        .pipe(z.array(z.url({ error: 'must be a comma-separated list of URLs' })).min(1, 'must list at least one URL')),
    ),
  })
  // Tests that never touch the database can run without one
  .refine((vars) => vars.NODE_ENV === 'test' || vars.MONGODB_URI, {
    path: ['MONGODB_URI'],
    message: 'is required',
  });

const result = schema.safeParse(process.env);

if (!result.success) {
  const problems = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment variables:\n${problems.join('\n')}`);
}

export const env = Object.freeze(result.data);
