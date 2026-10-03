-- What each account agreed to at sign-up (the versions of the Terms and the Privacy Policy, and when).
ALTER TABLE users ADD COLUMN terms_version TEXT;
ALTER TABLE users ADD COLUMN privacy_version TEXT;
ALTER TABLE users ADD COLUMN accepted_at INTEGER;
-- Each account's economy (level, experience, currencies, collection, rank, record), kept by the server
-- alone: the game can only change it through the server's own actions (boosters, crafting, rewards).
CREATE TABLE IF NOT EXISTS economy (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated INTEGER NOT NULL
);
-- Games against the AI (quickplay and campaign battles), so a reward is paid once per game the server saw start.
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  started INTEGER NOT NULL,
  finished INTEGER
);
CREATE INDEX IF NOT EXISTS games_user ON games(user_id, started);
-- Password resets: a one-hour token, stored by its hash.
CREATE TABLE IF NOT EXISTS resets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);
-- Sign in with Apple / Google: which account each outside identity belongs to.
CREATE TABLE IF NOT EXISTS identities (
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created INTEGER NOT NULL,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX IF NOT EXISTS identities_user ON identities(user_id);
