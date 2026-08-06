const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const dashboardRepo = require('../repositories/dashboardRepository');
const animeService = require('./animeService');
const config = require('../config');
const logger = require('../utils/logger');
const ui = require('../constants/ui');
const { buildListEmbed } = require('../ui/embeds/listEmbed');
const { createDebouncer } = require('../utils/debounceQueue');

class DashboardService {
  constructor(client) {
    this.client = client;
    this.debouncer = createDebouncer();
  }

  async init() {
    logger.info('Initializing Dashboard Service...');
    await this.recoverOrcreate();
  }

  async recoverOrcreate() {
    const storedMessages = await dashboardRepo.getMessages();
    const channel = await this.client.channels.fetch(config.discord.channelId).catch(err => null);

    if (!channel) {
      logger.error(`Could not find channel with ID ${config.discord.channelId}`);
      return;
    }

    // Main dashboard
    const mainMsgRow = storedMessages.find(m => m.embed_type === 'Main');
    if (mainMsgRow) {
      try {
        const msg = await channel.messages.fetch(mainMsgRow.message_id);
        await this.updateMainDashboard(msg);
        logger.info('Main dashboard recovered and updated.');
      } catch (e) {
        const isNotFound = (e && (e.code === 10008 || (e.message && e.message.includes('Unknown Message')) || (e.status === 404)));
        if (isNotFound) {
          logger.warn('Main dashboard message not found, recreating...');
          const newMsg = await this.createMainDashboard(channel);
          await dashboardRepo.saveMessage(newMsg.id, channel.id, 'Main');
        } else {
          logger.error('Failed to fetch main dashboard message:', e);
        }
      }
    } else {
      const newMsg = await this.createMainDashboard(channel);
      await dashboardRepo.saveMessage(newMsg.id, channel.id, 'Main');
    }

    // Stats dashboard
    const statsMsgRow = storedMessages.find(m => m.embed_type === 'Stats');
    if (statsMsgRow) {
      try {
        const msg = await channel.messages.fetch(statsMsgRow.message_id);
        await this.updateStatsDashboard(msg);
        logger.info('Stats dashboard recovered and updated.');
      } catch (e) {
        const isNotFound = (e && (e.code === 10008 || (e.message && e.message.includes('Unknown Message')) || (e.status === 404)));
        if (isNotFound) {
          logger.warn('Stats dashboard message not found, recreating...');
          const newMsg = await this.createStatsDashboard(channel);
          await dashboardRepo.saveMessage(newMsg.id, channel.id, 'Stats');
        } else {
          logger.error('Failed to fetch stats dashboard message:', e);
        }
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
    // Ensure the message and channel are editable and we have permissions
    if (!message || !message.channel) {
      logger.warn('Cannot update main dashboard - message or channel missing');
      return;
    }

    if (!message.editable) {
      logger.warn('Main dashboard message is not editable by the bot. Skipping update.');
      return;
    }

    const perms = message.channel.permissionsFor(this.client.user);
    if (!perms || !perms.has([PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks])) {
      logger.warn('Bot lacks permissions to edit dashboard in channel. Skipping update.');
      return;
    }

    const embed = await this.buildMainEmbed();
    try {
      await message.edit({ embeds: [embed] });
    } catch (e) {
      logger.error('Failed to edit main dashboard message:', e);
    }
  }

  async updateStatsDashboard(message) {
    if (!message || !message.channel) {
      logger.warn('Cannot update stats dashboard - message or channel missing');
      return;
    }

    if (!message.editable) {
      logger.warn('Stats dashboard message is not editable by the bot. Skipping update.');
      return;
    }

    const perms = message.channel.permissionsFor(this.client.user);
    if (!perms || !perms.has([PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks])) {
      logger.warn('Bot lacks permissions to edit stats dashboard in channel. Skipping update.');
      return;
    }

    const embed = await this.buildStatsEmbed();
    try {
      await message.edit({ embeds: [embed] });
    } catch (e) {
      logger.error('Failed to edit stats dashboard message:', e);
    }
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

  async buildMainEmbed() {
    const [watching, favorites] = await Promise.all([
      animeService.getCurrentlyWatching(5),
      animeService.getFavorites(5)
    ]);

    const stats = await animeService.getStats().catch(() => ({}));

    const sections = [];

    sections.push({
      title: `${ui.icons.stats} Statistics`,
      body: `Watching: ${stats.watching || 0}\nCompleted: ${stats.completed || 0}\nPlan: ${stats.planning || 0}`
    });

    if (watching && watching.length) {
      const body = watching.map(w => `**${w.english_title}** — ep ${w.current_episode}${w.episode_count ? `/${w.episode_count}` : ''}`).join('\n');
      sections.push({ title: `${ui.icons.watching} Continue Watching`, body });
    }

    if (favorites && favorites.length) {
      const body = favorites.map(f => `**${f.english_title}**`).join('\n');
      sections.push({ title: `${ui.icons.favorite} Favorites`, body });
    }

    const embed = buildListEmbed({
      title: '📚 Anime Hub',
      color: ui.colors.system,
      sections,
      footer: { text: 'Anime Library Bot', iconURL: null },
      timestamp: true
    });

    return embed;
  }

  async buildStatsEmbed() {
    const stats = await animeService.getStats();
    const fields = [
      { name: 'Total', value: `${stats.total || 0}`, inline: true },
      { name: 'Completed', value: `${stats.completed || 0}`, inline: true },
      { name: 'Watching', value: `${stats.watching || 0}`, inline: true },
      { name: 'Planning', value: `${stats.planning || 0}`, inline: true },
      { name: 'Episodes', value: `${stats.total_episodes || 0}`, inline: true },
      { name: 'Avg Rating', value: `${stats.avg_rating?.toFixed(1) || 'N/A'}`, inline: true }
    ];

    const embed = new EmbedBuilder()
      .setTitle('📊 Library Statistics')
      .setColor(ui.colors.stats)
      .addFields(fields)
      .setTimestamp();

    return embed;
  }

  // Public: mark dashboard as needing an update. Coalesces rapid requests.
  markDashboardDirty() {
    this.debouncer.schedule('dashboard', async () => {
      try {
        const stored = await dashboardRepo.getMessageByType('Main');
        const channel = await this.client.channels.fetch(config.discord.channelId).catch(() => null);
        if (!stored || !channel) return;
        try {
          const msg = await channel.messages.fetch(stored.message_id);
          await this.updateMainDashboard(msg);
        } catch (e) {
          const isNotFound = (e && (e.code === 10008 || (e.message && e.message.includes('Unknown Message')) || (e.status === 404)));
          if (isNotFound) {
            logger.warn('Dashboard message vanished before update; recreating...');
            const newMsg = await this.createMainDashboard(channel);
            await dashboardRepo.saveMessage(newMsg.id, channel.id, 'Main');
          } else {
            logger.error('Failed to refresh dashboard message:', e);
          }
        }
      } catch (err) {
        logger.error('Unexpected error refreshing dashboard:', err);
      }
    }, config.previewCacheTTLMs || ui.defaults.dashboardDebounceMs);
  }
}

module.exports = DashboardService;
