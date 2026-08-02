const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dashboardRepo = require('../repositories/dashboardRepository');
const animeService = require('./animeService');
const config = require('../config');
const logger = require('../utils/logger');

class DashboardService {
    constructor(client) {
        this.client = client;
    }

    async init() {
        logger.info("Initializing Dashboard Service...");
        await this.recoverOrcreate();
    }

    async recoverOrcreate() {
        const storedMessages = await dashboardRepo.getMessages();
        const channel = await this.client.channels.fetch(config.discord.channelId);

        if (!channel) {
            logger.error(`Could not find channel with ID ${config.discord.channelId}`);
            return;
        }

        // 1. Recover or Create Main Dashboard
        const mainMsg = storedMessages.find(m => m.embed_type === 'Main');
        if (mainMsg) {
            try {
                const msg = await channel.messages.fetch(mainMsg.message_id);
                await this.updateMainDashboard(msg);
                logger.info("Main dashboard recovered and updated.");
            } catch (e) {
                logger.warn("Main dashboard message not found, recreating...");
                const newMsg = await this.createMainDashboard(channel);
                await dashboardRepo.saveMessage(newMsg.id, channel.id, 'Main');
            }
        } else {
            const newMsg = await this.createMainDashboard(channel);
            await dashboardRepo.saveMessage(newMsg.id, channel.id, 'Main');
        }

        // 2. Recover or Create Stats Dashboard
        const statsMsg = storedMessages.find(m => m.embed_type === 'Stats');
        if (statsMsg) {
            try {
                const msg = await channel.messages.fetch(statsMsg.message_id);
                await this.updateStatsDashboard(msg);
                logger.info("Stats dashboard recovered and updated.");
            } catch (e) {
                logger.warn("Stats dashboard message not found, recreating...");
                const newMsg = await this.createStatsDashboard(channel);
                await dashboardRepo.saveMessage(newMsg.id, channel.id, 'Stats');
            }
        } else {
            const newMsg = await this.createStatsDashboard(channel);
            await dashboardRepo.saveMessage(newMsg.id, channel.id, 'Stats');
        }
    }

    async createMainDashboard(channel) {
        const embed = await this.buildMainEmbed();
        const row = this.buildMainButtons();
        return await channel.send({ embeds: [embed], components: [row] });
    }

    async createStatsDashboard(channel) {
        const embed = await this.buildStatsEmbed();
        return await channel.send({ embeds: [embed] });
    }

    async updateMainDashboard(message) {
        const embed = await this.buildMainEmbed();
        await message.edit({ embeds: [embed] });
    }

    async updateStatsDashboard(message) {
        const embed = await this.buildStatsEmbed();
        await message.edit({ embeds: [embed] });
    }

    async buildMainEmbed() {
        const [watching, favorites] = await Promise.all([
            animeService.getCurrentlyWatching(5),
            animeService.getFavorites(5)
        ]);

        const watchingText = watching.length
            ? watching.map(w => `**${w.english_title}** — ep ${w.current_episode}${w.episode_count ? `/${w.episode_count}` : ''}`).join('\n')
            : 'None currently watching.';

        const favoritesText = favorites.length
            ? favorites.map(f => `**${f.english_title}**`).join('\n')
            : 'No favorites yet.';

        return new EmbedBuilder()
            .setTitle('📺 Anime Library Dashboard')
            .setColor('#0099ff')
            .setDescription('Manage your anime collection and track your progress.')
            .addFields(
                { name: '🔥 Continue Watching', value: watchingText, inline: false },
                { name: '⭐ Favorites', value: favoritesText, inline: false }
            )
            .setTimestamp();
    }

    async buildStatsEmbed() {
        const stats = await animeService.getStats();
        const embed = new EmbedBuilder()
            .setTitle('📊 Library Statistics')
            .setColor('#2ecc71')
            .addFields(
                { name: 'Total', value: `${stats.total || 0}`, inline: true },
                { name: 'Completed', value: `${stats.completed || 0}`, inline: true },
                { name: 'Watching', value: `${stats.watching || 0}`, inline: true },
                { name: 'Planning', value: `${stats.planning || 0}`, inline: true },
                { name: 'Episodes', value: `${stats.total_episodes || 0}`, inline: true },
                { name: 'Avg Rating', value: `${stats.avg_rating?.toFixed(1) || 'N/A'}`, inline: true }
            );
        return embed;
    }

    buildMainButtons() {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('search_anime')
                    .setLabel('🔍 Search & Add')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('continue_watching')
                    .setLabel('▶️ Continue Watching')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('view_library')
                    .setLabel('📚 View Library')
                    .setStyle(ButtonStyle.Secondary)
            );
    }
}

module.exports = DashboardService;
