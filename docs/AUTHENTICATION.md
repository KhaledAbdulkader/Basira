# Authentication

Phase 2 implements password registration/sign-in, logout, Google provider integration, sessions, and server authorization. Business management and the admin panel are later phases. Local Google OAuth credentials were configured in the ignored `.env` on 2026-10-14. A replacement secret supplied as exact text resolved the diagnostic `invalid_client` rejection, and the server was restarted with it. The provider and sign-in button are enabled. A complete sign-in with the user's Google account remains unverified.

## Run locally

The existing ignored `.env` is configured for `basira_local` on `localhost:5433`, with separate `basira_dev`, `basira_test`, and `basira_shadow` databases. Do not replace that file with the template. A random local `NEXTAUTH_SECRET` has been generated without printing it. Keep the PostgreSQL Windows service running.

```sh
npm ci
npm run db:deploy
npm run dev
```

Open [Basira](http://localhost:3000). Choose **Create an account**, enter your name/email and a password of 12–128 characters, then sign in. There is no default application account; the PostgreSQL role/password is not a Basira login. All self-registered accounts start as `USER` / `ACTIVE`. The protected workspace includes the implemented business features. Phase 12 administration appears only for active ADMIN accounts; see [ADMINISTRATION.md](ADMINISTRATION.md) for explicit first-admin provisioning.

`NEXTAUTH_URL` must match the origin you actually visit. The local default is `http://localhost:3000`; do not substitute `127.0.0.1` or a different port without changing it. Registration enforces that exact origin. Production requires HTTPS and a strong independent session secret. Changing the secret invalidates existing sessions.

## Configure Google when ready

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select or create a project for Basira.
2. Open **Google Auth Platform**. If prompted, use **Get started** to configure the app's branding, support email, audience, and contact email. Use **Basira** as the app name.
3. For personal Google accounts, choose an external audience. While the app is in testing, add the Google accounts you will use under **Audience → Test users**, if the console requires test users for your configuration.
4. Under **Clients**, create an OAuth client with application type **Web application**, named **Basira local**.
5. Add the exact authorized redirect URI: `http://localhost:3000/api/auth/callback/google`. If the console asks for an authorized JavaScript origin, use `http://localhost:3000`. No Drive/Gmail scopes are needed; the provider requests only `openid email profile`.
6. Save the client ID and client secret directly in the project's ignored `.env`:

   ```dotenv
   GOOGLE_CLIENT_ID="YOUR_CLIENT_ID"
   GOOGLE_CLIENT_SECRET="YOUR_CLIENT_SECRET"
   ```

7. Restart the app. **Continue with Google** becomes available when both values are configured. Use an account that has not already registered with a password for the first Google test.
8. Confirm the consent screen, return to Basira, reload, and sign out. A Google-only user has a nullable password hash. Test a second sign-in with the same Google account to confirm that it reuses the existing user.
9. Before deployment, register the exact HTTPS production callback URI and configure production secrets separately. Do not use the local test client's callback for a different hostname/port.

Google requires the redirect URI to match its registered value. Its web client creation and secret-handling instructions are in the [official web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server) and [OAuth client management guide](https://support.google.com/cloud/answer/15549257). The provider-specific callback follows the [NextAuth v4 Google documentation](https://next-auth.js.org/providers/google).

## Session and authorization design

- Stable `next-auth@4.24.15` and the matching `@next-auth/prisma-adapter@1.0.7`; no v5 beta APIs. The adapter uses the generated Prisma 7 client. All adapter persistence operations have real database tests.
- NextAuth v4 Credentials requires JWT sessions. Users are explicitly persisted by `registerUser`; provider accounts are persisted through the official adapter. JWTs are encrypted, have an eight-hour session window, and carry the user ID. Framework cookies remain HttpOnly, SameSite=Lax, and Secure on HTTPS. The framework handles CSRF for sign-in/sign-out.
- `session` loads the current user from PostgreSQL on every session check and returns a narrow public projection. Deleted/suspended users yield no usable session identity. `requireUser(role?)` and `requirePageUser()` enforce server access. No client-supplied role is trusted. Every future private API/action must use these guards plus business ownership checks; layout protection alone does not authorize data access.
- Passwords use asynchronous Node `crypto.scrypt`, random 16-byte salts, constant-time comparison, and fixed N=32768/r=8/p=3 parameters. This is one of [OWASP's documented scrypt profiles](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt). Missing/malformed hashes still perform a dummy derivation. Passwords are not trimmed; email addresses are trimmed/lowercased before storage, with a database constraint enforcing canonical form.
- Registration accepts only name/email/password, limits streamed JSON to 8 KiB, and requires an exact same-origin request. Valid new/duplicate registrations share the same HTTP 202 message; duplicates do not replace hashes. Authentication failures are generic. Hashes and provider tokens never appear in session/API output; logs omit raw error metadata.
- Database-backed `AuthThrottle` enforces 10 login attempts per email per 15 minutes, 5 registrations per email per hour, and a shared 100-attempt/minute ceiling before hashing. Counters are atomic across processes, keys are HMACs, and expired entries are cleaned on later attempts. This conservative application-wide ceiling can temporarily affect all users under heavy traffic; review the limits and trusted edge/IP controls before public deployment. Login attempts count successes as well as failures; no attacker-controlled reset bypass exists.
- Google requires a verified email and an active user. Dangerous automatic email linking is explicitly disabled. An existing password account must continue with its original sign-in method; this phase has no account-linking settings UI. The adapter also rejects linking to a suspended user. Missing credentials disable the provider and explain its unavailability in the UI.

The session choice follows the [v4 Credentials documentation](https://next-auth.js.org/providers/credentials); callbacks follow the [v4 callback contract](https://next-auth.js.org/configuration/callbacks). `Session` and `VerificationToken` tables preserve the adapter contract; JWT sessions and the current providers do not normally populate them. Password changes/recovery, email verification flows, admin screens, and business ownership rules are outside Phase 2 and are not presented as implemented.

## Administration status controls

Phase 12 provides confirmed activation/suspension without changing the JWT session design. Every subsequent protected request reloads database status/role; suspended users have no usable identity. Activation permits an unexpired existing session again. In-flight work authorized before suspension is not universally cancelled. Status-version checks reject stale changes, sorted actor/target row locks recheck the acting admin after competing updates, and self-status changes are blocked. No password reset, role-editing web API or implicit admin assignment is added. See [ADMINISTRATION.md](ADMINISTRATION.md).

## Verification boundary

The local configuration check on 2026-10-14 confirmed that `/api/auth/providers` includes Google, the login button is enabled, and initiating sign-in produces an `accounts.google.com` authorization URL with the configured client ID, the exact localhost callback, `openid email profile` scopes, state, and PKCE. The client secret was absent from the rendered login HTML. This checks the start of the flow; it does not verify Google's registered redirect settings, the client secret during token exchange, or successful account creation. The supplied Google client screen states that access is restricted to test users; add the intended account under Google Auth Platform → Audience → Test users before the live test.

The subsequent live attempt returned `OAuthCallback`. A diagnostic token request using the screenshot-transcribed credentials and a deliberately invalid authorization code returned HTTP 401 `invalid_client`. After the user supplied a newly created secret as exact text, the same diagnostic returned HTTP 400 `invalid_grant`, as expected for the intentionally invalid authorization code. The client-authentication rejection is no longer reproduced. No real authorization code was replayed and no token was obtained. The server was restarted and the enabled login button, Google authorization URL, callback, and absence of the secret in login HTML were rechecked. Begin a fresh sign-in from `/login` to verify the full flow. Copy future secrets directly from Google's creation dialog or downloaded JSON instead of transcribing screenshots.

The old Google secret has not been disabled or deleted. After verifying successful sign-in with the new secret, disable the old secret, recheck sign-in, and then delete the disabled secret. Keep the OAuth client itself and its new secret. This follows [Google's secret-rotation procedure](https://support.google.com/cloud/answer/15549257).

Automated tests cover real password flows, database persistence, OAuth adapter operations and policy callbacks, role/status changes, cookies, CSRF rejection, and protected requests. They do not contact Google, use a mocked consent screen, or claim to verify a live Google token exchange. Finish the live sign-in checklist above after supplying credentials.
