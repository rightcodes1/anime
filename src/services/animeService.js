const { provider } = require('../api/animeProvider');
const animeRepository = require('../repositories/animeRepository');
const progressRepository = require('../repositories/progressRepository');
const notesRepository = require('../repositories/notesRepository');
const historyRepository = require('../repositories/historyRepository');
const db = require('../database/database');
const { sanitizeBindings } = require('../utils/sanitize');

class AnimeService {
    /**
     * Searches the local library first, then the Kitsu provider.
     * Returns { local: [...], provider: [...] }.
     * Throws 'KITSU_UNAVAILABLE' if the provider search itself fails
     * (as opposed to succeeding with zero matches) — callers can use that
     * to show a distinct "search is down" message instead of "no results".
     */
    async searchAnime(query) {
        const local = await animeRepository.findByTitle(query);
        const external = await provider.search(query);
        return { local, provider: external };
    }

    async getAnimeFromProvider(providerId) {
        return provider.getById(providerId);
    }

    async getAnimeByKitsuId(kitsuId) {
        return animeRepository.getById(kitsuId);
    }

    async addAnimeToLibrary(animeData, initialStatus = 'Plan To Watch') {
        // sanitize values to prevent undefined bindings
        const sanitized = sanitizeBindings(animeData);

        // NOTE: Using sequential repository calls rather than a client-level
        // transaction because the libSQL client used by this project requires
        // batch execution for atomic writes. A future change should add a
        // proper runInTransaction helper on the database module to enable
        // multi-statement transactions. For now, keep behavior functionally
        // equivalent while avoiding transactions errors seen in some hosts.
        const anime = await animeRepository.save(sanitized);
        const progress = await progressRepository.upsert(sanitized.providerId, { status: initialStatus });
        await historyRepository.add(sanitized.providerId, 'Added', { status: initialStatus });
        return { anime, progress };
    }

    async getProgress(kitsuId) {
        return progressRepository.getByKitsuId(kitsuId);
    }

    async updateProgress(kitsuId, progressData) {
        const sanitizedProgress = sanitizeBindings(progressData);
        const updated = await progressRepository.upsert(kitsuId, sanitizedProgress);
        await historyRepository.add(kitsuId, sanitizedProgress.eventType || 'Progress Updated', sanitizedProgress);
        return updated;
    }

    async getStats() {
        return progressRepository.getStats();
    }

    async getCurrentlyWatching(limit = 5) {
        return progressRepository.getCurrentlyWatching(limit);
    }

    async getFavorites(limit = 5) {
        return progressRepository.getFavorites(limit);
    }

    async getRecentUpdates(limit = 5) {
        const result = await db.execute({
            sql: `SELECT a.*, p.status, p.updated_at 
                  FROM anime a 
                  JOIN anime_progress p ON a.kitsu_id = p.kitsu_id 
                  ORDER BY p.updated_at DESC LIMIT ?`,
            args: [limit]
        });
        return result.rows;
    }

    async toggleFavorite(kitsuId) {
        return progressRepository.toggleFavorite(kitsuId);
    }

    async addNote(kitsuId, note) {
        return notesRepository.add(kitsuId, note);
    }

    async getNotes(kitsuId) {
        return notesRepository.getByKitsuId(kitsuId);
    }

    /**
     * All four deletes now run as a single batch write instead of four
     * sequential statements, so a mid-operation crash can't leave orphaned
     * notes/history/progress rows behind.
     */
    async removeAnime(kitsuId) {
        await db.transaction([
            { sql: 'DELETE FROM anime_notes WHERE kitsu_id = ?', args: [kitsuId] },
            { sql: 'DELETE FROM anime_history WHERE kitsu_id = ?', args: [kitsuId] },
            { sql: 'DELETE FROM anime_progress WHERE kitsu_id = ?', args: [kitsuId] },
            { sql: 'DELETE FROM anime WHERE kitsu_id = ?', args: [kitsuId] }
        ]);
    }

    async startRewatch(kitsuId) {
        const progress = await progressRepository.getByKitsuId(kitsuId);
        if (!progress) return null;

        const started = await progressRepository.startRewatch(kitsuId);
        if (!started) return null;

        const updated = await progressRepository.getByKitsuId(kitsuId);
        await historyRepository.add(kitsuId, 'Rewatch Started', { rewatchCount: updated.rewatch_count });
        return updated;
    }
}

module.exports = new AnimeService();
