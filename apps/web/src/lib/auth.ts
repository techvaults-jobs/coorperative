import "server-only";
import { schema } from "@techvaults/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { db } from "./db";
import { mails, sendMail } from "./mail";

function createAuth() {
  return betterAuth({
    appName: "TechVaults Cooperative",
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    database: drizzleAdapter(db(), {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        twoFactor: schema.twoFactors,
      },
    }),
    // Societies invite their officers; nobody can create an account from the sign-in page.
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendMail(mails.passwordReset(user.email, url));
      },
    },
    session: { expiresIn: 60 * 60 * 8, updateAge: 60 * 30 },
    rateLimit: { enabled: true, window: 60, max: 30 },
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: process.env.NODE_ENV === "production",
    },
    plugins: [twoFactor({ issuer: "TechVaults Cooperative" }), nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
let cached: Auth | undefined;

/** Created lazily so `next build` does not need database or secret configuration. */
export function auth(): Auth {
  cached ??= createAuth();
  return cached;
}
