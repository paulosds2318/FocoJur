import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { db } from '@/db';
import * as schema from '@/db/schema';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true, // RF-60: sem cadastro público
    minPasswordLength: 10,
    autoSignIn: false,
  },
  user: {
    additionalFields: {
      active: { type: 'boolean', defaultValue: true, input: false },
      mustChangePassword: { type: 'boolean', defaultValue: true, input: false },
      tempPasswordExpiresAt: { type: 'date', required: false, input: false },
      createdBy: { type: 'string', required: false, input: false },
    },
  },
  plugins: [admin({ defaultRole: 'lawyer', adminRoles: ['admin'] }), nextCookies()],
});
