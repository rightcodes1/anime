const db = require('../database/database');
const libraryDomain = require('../constants/libraryDomain');

// Responsible for all SQL related to the anime_progress table. Exposes a small,
// typed API used by LibraryService. The methods accept business concepts
// (filters/pagination/sort) and translate them to SQL internally.
const SORT_COLUMN_MAP = Object.freeze({
    [libraryDomain.LibrarySort.UPDATED]: 'p.updated_at',
    [libraryDomain.LibrarySort.EPISODE]: 'p.current_episode',
    [libraryDomain.LibrarySort.REWATCHS]: 'p.rewatch_count'
});

class ProgressRepository {
    async getByKitsuId(kitsuId) {
        const result = await db.execute({
            sql: 'SELECT * FROM anime_progress WHERE kitsu_id = ?',
            args: [kitsuId]
        });
        return result.rows[0] || null;
    }

    async upsert(kitsuId, progressData) {
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
                  rewatch_count = COALESCE(rewatch_count, 0) + 1,
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
                SUM(current_episode) as total_episodes,
                MAX(updated_at) as updated_at
            FROM anime_progress
        `);
        return stats.rows[0];
    }

    // Typed, limited filter API for Milestone 2.
    // Accepts a filter object and returns an integer count.
    // filter: { category?: string, favorite?: boolean }
    async countLibraryItems({ filter = {} } = {}) {
        const where = [];
        const args = [];

        if (filter.category) {
            const cfg = libraryDomain.CATEGORY_CONFIG[filter.category];
            if (cfg && cfg.databaseStatus) {
                where.push('p.status = ?');
                args.push(cfg.databaseStatus);
            }
        }
        if (typeof filter.favorite === 'boolean') {
            where.push('p.is_favorite = ?');
            args.push(filter.favorite ? 1 : 0);
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const sql = `SELECT COUNT(*) as cnt FROM anime_progress p ${whereSql}`;
        const res = await db.execute({ sql, args });
        return res.rows.length ? res.rows[0].cnt : 0;
    }

    /*
     * getLibraryPage
     * params: {
     *   filter: { category?: string, favorite?: boolean },
     *   pagination: { page: number, pageSize: number },
     *   sort: { field: libraryDomain.LibrarySort, direction: 'ASC'|'DESC' }
     * }
     * Returns: array of domain objects: { kitsuId, title, posterUrl, episodeCount, currentEpisode, rating, status, updatedAt, isFavorite }
     */
    async getLibraryPage({ filter = {}, pagination = { page: 1, pageSize: libraryDomain.defaults.pageSize }, sort = { field: libraryDomain.LibrarySort.UPDATED, direction: 'DESC' } } = {}) {
        const where = [];
        const args = [];

        if (filter.category) {
            const cfg = libraryDomain.CATEGORY_CONFIG[filter.category];
            if (cfg && cfg.databaseStatus) {
                where.push('p.status = ?');
                args.push(cfg.databaseStatus);
            }
        }
        if (typeof filter.favorite === 'boolean') {
            where.push('p.is_favorite = ?');
            args.push(filter.favorite ? 1 : 0);
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const sortCol = SORT_COLUMN_MAP[sort.field] || SORT_COLUMN_MAP[libraryDomain.LibrarySort.UPDATED];
        const sortDir = (sort.direction === 'ASC') ? 'ASC' : 'DESC';

        const page = Math.max(1, parseInt(pagination.page, 10) || 1);
        const pageSize = Math.max(1, parseInt(pagination.pageSize, 10) || libraryDomain.defaults.pageSize);
        const offset = (page - 1) * pageSize;

        const sql = `SELECT p.*, a.english_title, a.episode_count, a.poster_url
                     FROM anime_progress p
                     JOIN anime a ON a.kitsu_id = p.kitsu_id
                     ${whereSql}
                     ORDER BY ${sortCol} ${sortDir}
                     LIMIT ? OFFSET ?`;

        const res = await db.execute({ sql, args: [...args, pageSize, offset] });
        // Map DB rows to stable domain objects so callers don't depend on raw columns
        return res.rows.map(r => ({
            kitsuId: r.kitsu_id,
            title: r.english_title,
            posterUrl: r.poster_url,
            episodeCount: r.episode_count,
            currentEpisode: r.current_episode,
            rating: r.rating,
            status: r.status,
            updatedAt: r.updated_at,
            isFavorite: !!r.is_favorite
        }));
    }
}

module.exports = new ProgressRepository();
