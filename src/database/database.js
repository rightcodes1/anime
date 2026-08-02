const { createClient } = require("@libsql/client");
const config = require("../config");
const logger = require("../utils/logger");
const fs = require("fs").promises;
const path = require("path");

class Database {
    constructor() {
        this.client = createClient({
            url: config.turso.url,
            authToken: config.turso.authToken,
        });
    }

    async execute(stmt) {
        if (stmt && typeof stmt === "object" && Array.isArray(stmt.args)) {
            console.log("========== SQL DEBUG ==========");

            stmt.args.forEach((arg, index) => {
                console.log(
                    `Arg ${index}:`,
                    {
                        type: typeof arg,
                        isArray: Array.isArray(arg),
                        constructor: arg?.constructor?.name,
                        value: arg
                    }
                );
            });

            console.log("===============================");
        }

        return await this.client.execute(stmt);
    }

    // Marked async because it uses await internally
    async transaction(stmts) {
        return await this.client.batch(stmts, "write");
    }

    async runMigrations() {
        logger.info("Running database migrations...");

        // Ensure schema_version table exists
        await this.execute(`
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY
            )
        `);

        const result = await this.execute("SELECT version FROM schema_version");
        let currentVersion = result.rows.length > 0 ? result.rows[0].version : 0;

        const migrationsDir = __dirname;
        const files = await fs.readdir(migrationsDir);
        const migrationFiles = files
            .filter(f => f.endsWith(".sql"))
            .sort();

        for (const file of migrationFiles) {
            const version = parseInt(file.split("_")[0]);
            if (version > currentVersion) {
                logger.info(`Applying migration: ${file}`);
                const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");

                // Split by semicolon but be careful with triggers/functions if any
                const statements = sql
                    .split(";")
                    .map(s => s.trim())
                    .filter(s => s.length > 0);

                try {
                    await this.client.batch([
                        ...statements,
                        {
                            sql: "INSERT OR REPLACE INTO schema_version (version) VALUES (?)",
                            args: [version]
                        }
                    ], "write");
                    currentVersion = version;
                    logger.info(`Successfully applied migration: ${file}`);
                } catch (error) {
                    logger.error(`Failed to apply migration ${file}: ${error.message}`);
                    throw error;
                }
            }
        }
        logger.info("Database migrations completed.");
    }

    async close() {
        await this.client.close();
        logger.info("Database connection closed.");
    }
}

module.exports = new Database();
