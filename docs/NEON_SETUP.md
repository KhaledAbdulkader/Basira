# Neon setup

Configured November 17, 2026, using the user's existing project. This records connection and agent setup; it does not claim that the application has been deployed.

## Linked database

- Organization: `org-plain-hall-47258406`.
- Project: `little-scene-73366240` (`my-first-project`).
- Branch: `production`.
- Region: AWS Frankfurt (`aws-eu-central-1`).
- PostgreSQL: 18; the live connection reported 18.7.
- [Open the project](https://console.neon.tech/app/projects/little-scene-73366240/).

## Changes made

1. Installed Neon CLI 9.6.0 in the user's global npm directory and completed browser-based CLI authorization.
2. Installed the project skills `neon` and `neon-postgres` under `.agents/skills/`, including their reference files. `skills-lock.json` records the upstream version. Neither skill was previously installed.
3. Created `.codex/config.toml` with a Neon MCP OAuth endpoint scoped to this project. It contains a server URL, not an API key. No previous project MCP configuration existed; the global Codex configuration was preserved byte-for-byte.
4. Linked the existing project in ignored `.neon` and added `.neon` to `.gitignore`. Linking used `--no-env-pull` to preserve the existing development `.env`.
5. Pulled only Postgres connection variables into ignored `.env.production.local`: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_BRANCH`, and `NEON_BRANCH_ID`. Added `DIRECT_URL` using the exact unpooled URL because that is the name Basira's Prisma configuration reads. The existing `.env` was preserved byte-for-byte.
6. Added `.agents/skills` to `.prettierignore` so formatting does not rewrite upstream skills or invalidate their recorded hashes.
7. Updated the deployment guide to reflect the existing GitHub remote and Neon connection setup.
8. Created ignored local configuration backups, a read-only verification helper, and a verification result under `.local/`. These files are not uploaded to GitHub.

The application keeps its existing Prisma/`pg` database client, NextAuth authentication, and NVIDIA AI integration. No application dependency or schema change was needed. No additional Neon services, projects, branches, or paid plans were provisioned.

## Verification

- Direct PostgreSQL connection: passed.
- Pooled query using Basira's Prisma client: passed.
- TLS transport and server certificate verification: passed on both connections.
- Database endpoint pair: same host endpoint, database, and user, with the runtime URL using the pooler.
- Local development `.env` and global Codex settings: unchanged from the private pre-setup backups.
- MCP configuration: valid TOML, scoped to the requested project, with no embedded credentials.
- Production credentials and CLI context: ignored by Git.
- Public application tables: zero. Read-only checks made no database changes; migrations and data imports have not run.

## Remaining hosting steps

Restart Codex to load the new project MCP server and skills. The MCP connection uses its own OAuth flow, so Codex may ask for Neon sign-in on first use even though the CLI is authorized. MCP tool execution has not yet been verified in a restarted session.

Add the production environment values to Vercel's Production environment, set a fresh `NEXTAUTH_SECRET` and the final HTTPS `NEXTAUTH_URL`, then apply the checked-in Prisma migrations to the empty database as described in [DEPLOYMENT.md](DEPLOYMENT.md). Configure the Vercel function region as Frankfurt (`fra1`). Preview deployments must use a separate database or branch.

`.env.production.local` currently contains database settings only. It is not a complete Vercel environment export. Keep development and test commands pointed at the existing local databases. Next.js production mode automatically loads `.env.production.local`; when using production mode locally, choose the intended database explicitly.

## Sources

- [Neon setup prompt](https://neon.com/get-started/prompt.md).
- [Neon overview skill](https://neon.com/.well-known/agent-skills/neon/SKILL.md).

The overview skill's manual setup path was used because it supports preserving an existing `.env` with `link --no-env-pull` and pulling production variables into a separate file. `neon init` does not support `--no-env-pull`.
