const db = require('../database/database');

class HistoryRepository {
    async add(kitsuId, eventType, eventData) {
        await db.execute({
            sql: 'INSERT INTO anime_history (kitsu_id, event_type, event_data) VALUES (?, ?, ?)',
            args: [kitsuId, eventType, JSON.stringify(eventData)]
        });
    }

    async getByKitsuId(kitsuId, limit = 10) {
        const result = await db.execute({
            sql: 'SELECT * FROM anime_history WHERE kitsu_id = ? ORDER BY timestamp DESC LIMIT ?',
            args: [kitsuId, limit]
        });
        return result.rows;
    }

    async delete(kitsuId) {
        await db.execute({ sql: 'DELETE FROM anime_history WHERE kitsu_id = ?', args: [kitsuId] });
    }
}

module.exports = new HistoryRepository();
