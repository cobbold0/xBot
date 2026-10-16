import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '../core/db/prisma';

export const auth = betterAuth({
  secret: process.env.SESSION_SECRET || 'justbot-default-secret-must-be-at-least-32-chars',
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
});
