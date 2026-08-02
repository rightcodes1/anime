const db = require('../database/database');

class ProgressRepository {
    async getByKitsuId(kitsuId) {
        const result = await db.execute({
            sql: 'SELECT * FROM anime_progress WHERE kitsu_id = ?',
            args: [kitsuId]
        });
        return result.rows[0] || null;
    }

    /**
     * Atomic upsert: a single INSERT ... ON CONFLICT DO UPDATE statement.
     *
     * The old version read the row, computed new values in JS, then wrote
     * them back — two interactions racing on the same kitsu_id (e.g. a
     * double-tapped "episode +1" button) could interleave and one update
     * would silently overwrite the other. This version never reads before
     * writing: on conflict, each column falls back to COALESCE(new value,
     * existing value) evaluated by SQLite itself in the same statement that
     * does the write, so there's no window for a lost update.
     */
    async upsert(kitsuId, progressData) {
        const now = new Date().toISOString();

        const status = progressData.status ?? null;
        const currentEntry = progressData.currentEntry ?? null;
        const currentEpisode = progressData.currentEpisode ?? null;
        const rating = progressData.rating ?? null;
        const rewatchCount = progressData.rewatchCount ?? null;
        const isFavorite = progressData.isFavorite ?? null;
        const lastWatchedAt = progressData.lastWatchedAt ?? null;

        await db.execute({
            sql: `INSERT INTO anime_progress (
                    kitsu_id, status, current_entry, current_episode,
                    rating, rewatch_count, is_favorite, last_watched_at, updated_at
                  ) VALUES (
                    ?,
                    COALESCE(?, 'Plan To Watch'),
                    ?,
                    COALESCE(?, 0),
                    ?,
                    COALESCE(?, 0),
                    COALESCE(?, 0),
                    COALESCE(?, CURRENT_TIMESTAMP),
                    CURRENT_TIMESTAMP
                  )
                  ON CONFLICT(kitsu_id) DO UPDATE SET
                    status = COALESCE(?, status),
                    current_entry = COALESCE(?, current_entry),
                    current_episode = COALESCE(?, current_episode),
                    rating = COALESCE(?, rating),
                    rewatch_count = COALESCE(?, rewatch_count),
                    is_favorite = COALESCE(?, is_favorite),
                    last_watched_at = COALESCE(?, last_watched_at),
                    updated_at = CURRENT_TIMESTAMP`,
            args: [
                kitsuId,
                status, currentEntry, currentEpisode, rating, rewatchCount, isFavorite, lastWatchedAt,
                status, currentEntry, currentEpisode, rating, rewatchCount, isFavorite, lastWatchedAt
            ]
        });

        return this.getByKitsuId(kitsuId);
    }

    /**
     * Atomic flip — a single UPDATE that computes the new value in SQL, so
     * two rapid clicks can't both read "false" and both write "true".
     */
    async toggleFavorite(kitsuId) {
        const result = await db.execute({
            sql: `UPDATE anime_progress
                  SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END,
                      updated_at = CURRENT_TIMESTAMP
                  WHERE kitsu_id = ?`,
            args: [kitsuId]
        });
        if (!result.rowsAffected) return null;

        const updated = await this.getByKitsuId(kitsuId);
        return updated ? updated.is_favorite : null;
    }

    async startRewatch(kitsuId) {
        const result = await db.execute({
            sql: `UPDATE anime_progress SET 
                  status = 'Watching', 
                  current_episode = 0, 
                  rewatch_count = rewatch_count + 1,
                  updated_at = CURRENT_TIMESTAMP 
                  WHERE kitsu_id = ?`,
            args: [kitsuId]
        });
        return result.rowsAffected > 0;
    }

    async delete(kitsuId) {
        await db.execute({ sql: 'DELETE FROM anime_progress WHERE kitsu_id = ?', args: [kitsuId] });
    }

    async getStats() {
        const stats = await db.execute(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'Watching' THEN 1 ELSE 0 END) as watching,
                SUM(CASE WHEN status = 'On Hold' THEN 1 ELSE 0 END) as on_hold,
                SUM(CASE WHEN status = 'Dropped' THEN 1 ELSE 0 END) as dropped,
                SUM(CASE WHEN status = 'Plan To Watch' THEN 1 ELSE 0 END) as planning,
                AVG(rating) as avg_rating,
                SUM(current_episode) as total_episodes
            FROM anime_progress
        `);
        return stats.rows[0];
    }

    async getCurrentlyWatching(limit = 5) {
        const result = await db.execute({
            sql: `SELECT p.*, a.english_title, a.episode_count
                  FROM anime_progress p
                  JOIN anime a ON a.kitsu_id = p.kitsu_id
                  WHERE p.status = 'Watching'
                  ORDER BY p.updated_at DESC
                  LIMIT ?`,
            args: [limit]
        });
        return result.rows;
    }

    async getFavorites(limit = 5) {
        const result = await db.execute({
            sql: `SELECT p.*, a.english_title
                  FROM anime_progress p
                  JOIN anime a ON a.kitsu_id = p.kitsu_id
                  WHERE p.is_favorite = 1
                  ORDER BY p.updated_at DESC
                  LIMIT ?`,
            args: [limit]
        });
        return result.rows;
    }
}

module.exports = new ProgressRepository();
