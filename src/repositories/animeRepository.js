const db = require('../database/database');

function escapeLike(value) {
    // Escape SQLite LIKE wildcards so a title containing % or _ is matched
    // literally instead of as a wildcard.
    return value.replace(/[\\%_]/g, ch => `\\${ch}`);
}

class AnimeRepository {
    async findByTitle(query) {
        const escaped = `%${escapeLike(query)}%`;
        const result = await db.execute({
            sql: `SELECT * FROM anime WHERE 
                  english_title LIKE ? ESCAPE '\\' OR 
                  romaji_title LIKE ? ESCAPE '\\' OR 
                  japanese_title LIKE ? ESCAPE '\\'`,
            args: [escaped, escaped, escaped]
        });
        return result.rows;
    }

    async getById(kitsuId) {
        const result = await db.execute({
            sql: 'SELECT * FROM anime WHERE kitsu_id = ?',
            args: [kitsuId]
        });
        return result.rows[0] || null;
    }

    /**
     * Upserts anime metadata. Uses INSERT ... ON CONFLICT DO UPDATE instead of
     * INSERT OR REPLACE so that:
     *  - created_at is set once on first insert and never touched again
     *    (REPLACE used to silently reset it on every re-save)
     *  - year/season are actually persisted (they were computed by the
     *    provider but previously missing from the column list entirely)
     */
    async save(animeData) {
        await db.execute({
            sql: `INSERT INTO anime (
                kitsu_id, english_title, romaji_title, japanese_title,
                synopsis, poster_url, cover_url, banner_url,
                status, start_date, end_date, season, year,
                episode_count, episode_duration, format, popularity, community_rating,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(kitsu_id) DO UPDATE SET
                english_title = excluded.english_title,
                romaji_title = excluded.romaji_title,
                japanese_title = excluded.japanese_title,
                synopsis = excluded.synopsis,
                poster_url = excluded.poster_url,
                cover_url = excluded.cover_url,
                banner_url = excluded.banner_url,
                status = excluded.status,
                start_date = excluded.start_date,
                end_date = excluded.end_date,
                season = excluded.season,
                year = excluded.year,
                episode_count = excluded.episode_count,
                episode_duration = excluded.episode_duration,
                format = excluded.format,
                popularity = excluded.popularity,
                community_rating = excluded.community_rating,
                updated_at = CURRENT_TIMESTAMP`,
            args: [
                animeData.providerId,
                animeData.englishTitle,
                animeData.romajiTitle,
                animeData.japaneseTitle,
                animeData.synopsis,
                animeData.posterUrl,
                animeData.coverUrl,
                animeData.bannerUrl,
                animeData.status,
                animeData.startDate,
                animeData.endDate,
                animeData.season,
                animeData.year,
                animeData.episodeCount,
                animeData.episodeLength,
                animeData.format,
                animeData.popularity,
                animeData.communityRating
            ]
        });
        return this.getById(animeData.providerId);
    }

    async delete(kitsuId) {
        await db.execute({ sql: 'DELETE FROM anime WHERE kitsu_id = ?', args: [kitsuId] });
    }
}

module.exports = new AnimeRepository();
