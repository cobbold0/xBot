import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '../core/db/prisma';

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || 'https://xbot.cobbold.dev',
  trustedOrigins: [
    'https://xbot.cobbold.dev',
    'https://justbot.cobbold.dev',
    'http://localhost:3007',
  ],
  secret: process.env.SESSION_SECRET || 'justbot-default-secret-must-be-at-least-32-chars',
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
});
