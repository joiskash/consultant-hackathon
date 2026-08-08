// Engine UNIT tests must not depend on Postgres. CI sets DATABASE_URL to its
// Postgres service, but the `sessions` table is only migrated in the separate
// integration step — so unit tests (e.g. walkthrough) would hit an unmigrated
// DB and fail with `relation "sessions" does not exist`. Clearing it here forces
// sessionStore's in-memory path. The integration config overrides setupFiles to []
// so integration tests keep DATABASE_URL.
//
// Set to '' (falsy) rather than delete: the engine calls dotenv.config() on
// import, which would RE-INJECT DATABASE_URL from a local .env if the key were
// merely deleted. dotenv does not override an already-present key, so '' sticks.
process.env.DATABASE_URL = '';
