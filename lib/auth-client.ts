'use client';

import { createAuthClient } from 'better-auth/react';
import { usernameClient, inferAdditionalFields } from 'better-auth/client/plugins';
import type { auth } from './auth';

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  plugins: [
    usernameClient(),
    inferAdditionalFields<typeof auth>(),
  ],
});

export const {
  signIn,
  signOut,
  signUp,
  useSession,
  getSession,
} = authClient;
