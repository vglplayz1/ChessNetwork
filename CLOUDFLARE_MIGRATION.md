# Cloudflare migration scaffold

This branch is a deployment scaffold, not a production-ready Chess Network migration.

## Included
- Cloudflare Workers configuration for `chess-network-api`
- D1 binding named `DB` pointing to `chess-network-db`
- Static asset hosting from `public/`
- `/api/health` database connectivity check
- Explicit 501 responses for API endpoints that are not migrated yet

## Required before production
- Replace Hatchable auth in `public/login.html` and `public/app.js`
- Implement email-code delivery and verification using a configured email provider
- Port matchmaking, game sync/clocks, friends/challenges, and ratings APIs to D1/SQLite
- Test end-to-end multiplayer with two separate accounts
- Only then deploy to the main production worker

Do not use this scaffold as the public production site yet. The existing Hatchable source files remain unchanged as migration references.
