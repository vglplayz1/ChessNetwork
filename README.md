# Chess Network

Chess Network is being migrated from Hatchable to Cloudflare Workers + D1.

## Migration status

- [x] Dedicated GitHub repository created
- [x] Original frontend copied from Hatchable (`public/`)
- [x] Original API handlers and PostgreSQL migrations copied for reference
- [ ] Replace Hatchable-specific API runtime and authentication
- [ ] Convert PostgreSQL schema and queries to D1 / SQLite
- [ ] Configure Cloudflare Workers and D1 bindings
- [ ] Test multiplayer, matchmaking, clocks, friends, challenges, and ratings
- [ ] Deploy to Cloudflare and verify the public app

**Important:** The copied API files still import the Hatchable SDK and use PostgreSQL-specific SQL. This is a source backup, not a deployable Cloudflare migration yet. Do not deploy this version as production.

## Features to preserve

- Online matchmaking and synchronized clocks
- Bullet, Blitz, Rapid, and Classical time controls
- Friends, requests, and direct challenges
- Elo rating pools and leaderboards
- Existing chess interface and separate bot mode

## Hosting target

Cloudflare Workers for API and static assets, with Cloudflare D1 for persistent data. The replacement for Hatchable-managed email-code authentication must be configured before public launch.
