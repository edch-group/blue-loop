-- Anonymous game summaries, for balancing (src/engine/stats.ts): the decks on each side, the result, the
-- length, and the cards played. No player or account is recorded; the day is kept, not the time.
CREATE TABLE game_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day INTEGER NOT NULL,
  version TEXT NOT NULL,
  mode TEXT NOT NULL,
  winner_seat INTEGER,
  end_reason TEXT NOT NULL,
  rounds INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX game_stats_day ON game_stats (day);
