const db = require('../database/database');

class DashboardRepository {
    async saveMessage(messageId, channelId, embedType) {
        await db.execute({
            sql: `INSERT OR REPLACE INTO dashboard_messages (
                    message_id, channel_id, embed_type, updated_at
                  ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
            args: [messageId, channelId, embedType]
        });
    }

    async getMessages() {
        const result = await db.execute("SELECT * FROM dashboard_messages");
        return result.rows;
    }

    async getMessageByType(embedType) {
        const result = await db.execute({
            sql: "SELECT * FROM dashboard_messages WHERE embed_type = ?",
            args: [embedType]
        });
        return result.rows[0] || null;
    }

    async deleteMessage(messageId) {
        await db.execute({
            sql: "DELETE FROM dashboard_messages WHERE message_id = ?",
            args: [messageId]
        });
    }

    async clearAll() {
        await db.execute("DELETE FROM dashboard_messages");
    }
}

module.exports = new DashboardRepository();
