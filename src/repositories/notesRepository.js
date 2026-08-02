const db = require('../database/database');

class NotesRepository {
    async add(kitsuId, note) {
        await db.execute({
            sql: 'INSERT INTO anime_notes (kitsu_id, note) VALUES (?, ?)',
            args: [kitsuId, note]
        });
    }

    async getByKitsuId(kitsuId) {
        const result = await db.execute({
            sql: 'SELECT * FROM anime_notes WHERE kitsu_id = ? ORDER BY created_at DESC',
            args: [kitsuId]
        });
        return result.rows;
    }

    async delete(kitsuId) {
        await db.execute({ sql: 'DELETE FROM anime_notes WHERE kitsu_id = ?', args: [kitsuId] });
    }
}

module.exports = new NotesRepository();
