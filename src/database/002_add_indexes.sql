-- Indexes for the foreign-key/filter columns hit on every dashboard refresh
-- and every notes/history lookup (SQLite does not auto-index foreign keys).

CREATE INDEX IF NOT EXISTS idx_anime_notes_kitsu ON anime_notes(kitsu_id);
CREATE INDEX IF NOT EXISTS idx_anime_history_kitsu ON anime_history(kitsu_id);
CREATE INDEX IF NOT EXISTS idx_anime_progress_status ON anime_progress(status);
