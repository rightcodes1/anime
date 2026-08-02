const express = require('express');
const config = require('./config');
const logger = require('./utils/logger');
const db = require('./database/database');
const { Client, GatewayIntentBits } = require('discord.js');
const DashboardService = require('./services/dashboardService');
const InteractionHandler = require('./bot/interactionHandler');

const app = express();
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// Health Check Endpoint
app.get('/health', async (req, res) => {
    const health = {
        status: 'ok',
        uptime: process.uptime(),
        timestamp: Date.now(),
        checks: {
            database: 'unknown',
            discord: 'unknown'
        }
    };

    try {
        await db.execute("SELECT 1");
        health.checks.database = 'healthy';
    } catch (e) {
        health.checks.database = 'unhealthy';
        health.status = 'error';
    }

    health.checks.discord = client.isReady() ? 'healthy' : 'unhealthy';
    if (health.checks.discord === 'unhealthy') health.status = 'error';

    res.status(health.status === 'ok' ? 200 : 503).json(health);
});

async function bootstrap() {
    try {
        logger.info("Starting Anime Library Bot...");

        // 1. Run Migrations
        await db.runMigrations();

        // 2. Start HTTP Server
        app.listen(config.port, () => {
            logger.info(`Health server listening on port ${config.port}`);
        });

        // 3. Login to Discord
        await client.login(config.discord.token);
        logger.info(`Logged in to Discord as ${client.user.tag}`);

        // 4. Initialize Bot Services
        const dashboardService = new DashboardService(client);
        const interactionHandler = new InteractionHandler(client, dashboardService);

        await dashboardService.init();

        client.on('interactionCreate', async (interaction) => {
            await interactionHandler.handleInteraction(interaction);
        });

        logger.info("Bot services initialized.");

    } catch (error) {
        logger.error("Bootstrap failed:", error);
        process.exit(1);
    }
}

// Graceful Shutdown
async function shutdown(signal) {
    logger.info(`Received ${signal}. Shutting down gracefully...`);

    try {
        // Close Discord
        if (client.isReady()) {
            client.destroy();
            logger.info("Discord connection closed.");
        }

        // Close Database
        await db.close();

        logger.info("Graceful shutdown completed.");
        process.exit(0);
    } catch (error) {
        logger.error("Error during shutdown:", error);
        process.exit(1);
    }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

bootstrap();
