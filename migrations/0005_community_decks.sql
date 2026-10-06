-- Community decks: deck lists players choose to share, credited to the name they go by in the game. Anyone
-- signed in can browse them and save a copy. A player's own are removed with their account.
CREATE TABLE community_decks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  author TEXT NOT NULL,
  name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  cards TEXT NOT NULL,
  saves INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX community_decks_popular ON community_decks (hidden, saves DESC, created DESC);
CREATE INDEX community_decks_new ON community_decks (hidden, created DESC);
CREATE INDEX community_decks_user ON community_decks (user_id);
-- Who has saved which deck, once each (a hash of the account, not the account itself), for the count.
CREATE TABLE community_deck_saves (
  deck_id TEXT NOT NULL,
  saver TEXT NOT NULL,
  PRIMARY KEY (deck_id, saver)
);
