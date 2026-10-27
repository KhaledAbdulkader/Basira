# Local PostgreSQL with pgAdmin 4

Basira connects directly to PostgreSQL through Prisma. pgAdmin is the graphical tool used to create and manage the local role/databases.

The project owner's PostgreSQL 18 server was verified at `localhost:5433`. The dedicated role is `basira_local`. Actual passwords belong only in the ignored `.env` file. This document contains no real credentials.

## Create the role and databases

1. Expand **PostgreSQL 18** in pgAdmin's Object Explorer. Use your existing administrator login for this setup.
2. Right-click **Login/Group Roles → Create → Login/Group Role**.
3. In **General**, enter `basira_local`.
4. In **Definition**, set a strong local password.
5. In **Privileges**, enable **Can login?**. Leave Superuser, Create roles, Create databases, Replication, and Bypass RLS off. Do not add membership in other roles. Save.
6. Right-click **Databases → Create → Database**.
7. Enter `basira_dev` and select `basira_local` as owner. Leave other database settings at their defaults and save.
8. Repeat for `basira_test` and `basira_shadow`, both owned by `basira_local`.
9. Right-click the server → **Properties → Connection** to verify the hostname and port. This computer uses port **5433**, not the common default 5432.

Use [pgAdmin's role dialog](https://www.pgadmin.org/docs/pgadmin4/latest/role_dialog.html) and [database dialog](https://www.pgadmin.org/docs/pgadmin4/latest/database_dialog.html) for the current field descriptions. Keep unrelated project databases and open queries unchanged.

## Configure the application

Copy `.env.example` to `.env` in the project root. Preserve an existing configured `.env` rather than overwriting it. Set:

```dotenv
DATABASE_URL="postgresql://basira_local:YOUR_ENCODED_PASSWORD@localhost:5433/basira_dev?schema=public"
TEST_DATABASE_URL="postgresql://basira_local:YOUR_ENCODED_PASSWORD@localhost:5433/basira_test?schema=public"
SHADOW_DATABASE_URL="postgresql://basira_local:YOUR_ENCODED_PASSWORD@localhost:5433/basira_shadow?schema=public"
```

Replace the password placeholder locally. URL-encode special characters: for example, `@` becomes `%40`, `?` becomes `%3F`, `#` becomes `%23`, and `%` becomes `%25`. Do not encode the whole connection URL. Use the exact password entered for `basira_local`, not the administrator or pgAdmin master password. Avoid accidentally saving `.env.txt`.

Phase 2 requires NEXTAUTH_URL and a random NEXTAUTH_SECRET; this workspace’s local secret is already configured. Google credentials are optional until enabling Google sign-in, and OpenAI remains unused. See AUTHENTICATION.md. Never put real credentials in `.env.example`, documentation, source code, screenshots, or version control.

## Verify

After `npm ci`, run:

```sh
npm run db:validate
npm run db:check
npm run test:db
```

`db:check` performs a read-only Prisma connectivity query against development. `test:db` requires a separate database ending in `_test`; it tests a transaction and exact PostgreSQL decimal addition using a temporary table that is removed on commit. It does not migrate, truncate, or drop existing application tables.

`basira_shadow` is disposable space for future Prisma development migrations. Never point the shadow URL at development, test, production, or any unrelated database. The CLI configuration rejects a shadow URL with the development database's name. A dedicated shadow database allows the application role to remain without the Create databases privilege.

Authentication, business profiles, and Phase 4 core record tables are applied through Prisma migrations. Run `npm run db:deploy` for development and `npm run db:migrate:test` for the separate test database. Do not create application tables manually in pgAdmin. The core-record migration also backfills default expense categories for existing profiles.

## Troubleshooting

| Symptom                                  | Check                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| Connection refused                       | PostgreSQL service running; correct host and **5433** port on this computer |
| Password authentication failed           | `basira_local` login enabled, correct role password, URL encoding           |
| Database does not exist                  | Exact database spelling and correct server selected                         |
| Permission denied during later migration | Correct database owner and dedicated shadow database                        |
| Test database rejected                   | Explicit `TEST_DATABASE_URL`, separate name ending in `_test`               |

The connection-check script deliberately avoids printing raw driver errors because those can contain connection details.
