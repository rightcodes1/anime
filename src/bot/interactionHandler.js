const {
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder
} = require('discord.js');
const animeService = require('../services/animeService');
const logger = require('../utils/logger');
const previewCache = require('../cache/previewCache');
const config = require('../config');

class InteractionHandler {
    constructor(client, dashboardService) {
        this.client = client;
        this.dashboardService = dashboardService;
        // Guards against double-clicks / duplicate submits firing the same
        // handler twice before the first run finishes.
        this._inFlight = new Set();
    }

    async handleInteraction(interaction) {
        const dedupeKey = `${interaction.user.id}:${interaction.type}:${interaction.customId ?? 'n/a'}`;
        if (this._inFlight.has(dedupeKey)) {
            logger.warn(`Ignoring duplicate interaction: ${dedupeKey}`);
            return;
        }
        this._inFlight.add(dedupeKey);

        try {
            if (interaction.isButton()) {
                await this.handleButton(interaction);
            } else if (interaction.isStringSelectMenu && interaction.isStringSelectMenu()) {
                await this.handleSelectMenu(interaction);
            } else if (interaction.isModalSubmit()) {
                await this.handleModal(interaction);
            }
        } catch (error) {
            logger.error("Interaction error:", error);
            const message = error.message === 'KITSU_UNAVAILABLE'
                ? "Kitsu (the anime database) is temporarily unavailable — please try again shortly."
                : "An error occurred.";
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: message, ephemeral: true });
            } else {
                await interaction.editReply({ content: message, embeds: [], components: [] }).catch(() => {});
            }
        } finally {
            this._inFlight.delete(dedupeKey);
        }
    }

    async handleButton(interaction) {
        const { customId } = interaction;

        if (customId === 'search_anime') {
            const modal = new ModalBuilder()
                .setCustomId('anime_search_modal')
                .setTitle('Search Anime');

            const queryInput = new TextInputBuilder()
                .setCustomId('search_query')
                .setLabel("Enter anime title")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(queryInput));
            await interaction.showModal(modal);
        } else if (customId === 'continue_watching') {
            await this.handleContinueWatching(interaction);
        } else if (customId === 'cancel_search') {
            // This button lives on a message the interaction hasn't replied
            // to or deferred yet, so it must acknowledge + edit in one call.
            await interaction.update({ content: "Search cancelled.", embeds: [], components: [] });
        } else if (customId.startsWith('status_')) {
            // Backwards-compat: some messages may still have buttons — support them.
            const parts = customId.split('_');
            const providerId = parseInt(parts[1], 10);
            const statusKey = parts.slice(2).join('_'); // e.g. COMPLETED, WATCHING, ON_HOLD, PLAN, DROPPED, CANCEL

            if (statusKey === 'CANCEL') {
                // Acknowledge and close the preview
                await interaction.update({ content: 'Cancelled.', embeds: [], components: [] });
                return;
            }

            if (['WATCHING', 'ON_HOLD', 'DROPPED'].includes(statusKey)) {
                await this.showProgressModal(interaction, providerId, statusKey);
                return;
            }

            await interaction.deferUpdate();
            const animeData = await animeService.getAnimeFromProvider(providerId);
            if (!animeData) {
                await interaction.editReply({ content: "That title no longer exists on Kitsu.", embeds: [], components: [] });
                return;
            }

            if (statusKey === 'PLAN') {
                await animeService.addAnimeToLibrary(animeData, 'Plan To Watch');
                await interaction.editReply({ content: `✅ Saved **${animeData.englishTitle}** as Plan To Watch.`, embeds: [], components: [] });
                await this.dashboardService.recoverOrcreate();
                return;
            }

            if (statusKey === 'COMPLETED') {
                await animeService.addAnimeToLibrary(animeData, 'Completed');
                if (animeData.episodeCount) {
                    await animeService.updateProgress(providerId, {
                        currentEpisode: animeData.episodeCount,
                        status: 'Completed',
                        eventType: 'Added as Completed'
                    });
                }
                await interaction.editReply({ content: `✅ Saved **${animeData.englishTitle}** as Completed.`, embeds: [], components: [] });
                await this.dashboardService.recoverOrcreate();
                return;
            }

        } else if (customId.startsWith('update_ep_')) {
            const providerId = customId.split('_')[2];
            await this.showEpisodeUpdateModal(interaction, providerId);
        } else if (customId === 'view_library') {
            // Respond quickly so Discord doesn't report a timeout.
            await interaction.deferReply({ ephemeral: true });

            try {
                const [watching, favorites, recent] = await Promise.all([
                    animeService.getCurrentlyWatching(10),
                    animeService.getFavorites(10),
                    animeService.getRecentUpdates(10)
                ]);

                const sections = [];

                if (watching.length) {
                    sections.push('**Currently Watching**\n' + watching.map(w => `**${w.english_title}** — ep ${w.current_episode}${w.episode_count ? `/${w.episode_count}` : ''}`).join('\n'));
                }

                if (favorites.length) {
                    sections.push('**Favorites**\n' + favorites.map(f => `**${f.english_title}**`).join('\n'));
                }

                if (recent.length) {
                    sections.push('**Recent Updates**\n' + recent.map(r => `**${r.english_title}** — ${r.status || 'Unknown'} (updated)` ).join('\n'));
                }

                const content = sections.length ? sections.join('\n\n') : "Your library is empty.";
                await interaction.editReply({ content });
            } catch (err) {
                logger.error('Failed to build library view:', err);
                await interaction.editReply({ content: 'Failed to fetch your library — please try again later.' });
            }
        }
    }

    async showProgressModal(interaction, providerId, statusKey) {
        // Collect season (optional) and episode (required) in a single modal.
        const modal = new ModalBuilder()
            .setCustomId(`progress_modal_${providerId}_${statusKey}`)
            .setTitle('Set Progress');

        const seasonInput = new TextInputBuilder()
            .setCustomId('season_number')
            .setLabel('Current season (optional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        const epInput = new TextInputBuilder()
            .setCustomId('ep_number')
            .setLabel('Current episode')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(seasonInput));
        modal.addComponents(new ActionRowBuilder().addComponents(epInput));

        await interaction.showModal(modal);
    }

    async handleContinueWatching(interaction) {
        const watching = await animeService.getCurrentlyWatching(10);
        if (watching.length === 0) {
            return await interaction.reply({ content: "You aren't currently watching anything!", ephemeral: true });
        }

        const list = watching
            .map(w => `**${w.english_title}** — ep ${w.current_episode}${w.episode_count ? `/${w.episode_count}` : ''}`)
            .join('\n');

        await interaction.reply({ content: `**Currently Watching**\n${list}`, ephemeral: true });
    }

    async showEpisodeUpdateModal(interaction, providerId) {
        const modal = new ModalBuilder()
            .setCustomId(`ep_modal_${providerId}`)
            .setTitle('Update Progress');

        const epInput = new TextInputBuilder()
            .setCustomId('ep_number')
            .setLabel("What episode are you on now?")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(epInput));
        await interaction.showModal(modal);
    }

    async handleModal(interaction) {
        if (interaction.customId === 'anime_search_modal') {
            const query = interaction.fields.getTextInputValue('search_query');
            await interaction.deferReply({ ephemeral: true });

            const results = await animeService.searchAnime(query);
            if (results.provider.length === 0) {
                return await interaction.editReply("No results found.");
            }

            const anime = results.provider[0];
            const embed = this.buildPreviewEmbed(anime);

            // Cache preview data for this user/session to avoid repeat provider calls.
            const cacheKey = `${interaction.user.id}:${anime.providerId}`;
            previewCache.set(cacheKey, anime);

            // Build select menu for status selection.
            const statusRow = this.buildStatusSelect(interaction.user.id, anime.providerId);

            await interaction.editReply({
                content: "Is this the anime you're looking for?",
                embeds: [embed],
                components: [statusRow]
            });
        } else if (interaction.customId.startsWith('ep_modal_')) {
            const providerId = parseInt(interaction.customId.split('_')[2], 10);
            const ep = parseInt(interaction.fields.getTextInputValue('ep_number'), 10);

            await interaction.deferReply({ ephemeral: true });

            if (Number.isNaN(ep) || ep < 0) {
                return await interaction.editReply("Please enter a valid, non-negative episode number.");
            }

            const anime = await animeService.getAnimeByKitsuId(providerId);
            if (!anime) {
                return await interaction.editReply("Couldn't find that anime in your library anymore.");
            }

            await animeService.updateProgress(providerId, {
                currentEpisode: ep,
                eventType: 'Episode Updated'
            });

            let content = `✅ Updated **${anime.english_title}** to episode ${ep}.`;

            if (anime.episode_count && ep >= anime.episode_count) {
                await animeService.updateProgress(providerId, { status: 'Completed', eventType: 'Completed' });
                content += "\n🎉 Congratulations! You've finished this anime!";
            }

            await interaction.editReply(content);
            await this.dashboardService.recoverOrcreate();
        } else if (interaction.customId.startsWith('progress_modal_')) {
            // Format: progress_modal_{providerId}_{statusKey}
            const parts = interaction.customId.split('_');
            const providerId = parseInt(parts[2], 10);
            const statusKey = parts.slice(3).join('_');

            const seasonRaw = interaction.fields.getTextInputValue('season_number') || null;
            const epRaw = interaction.fields.getTextInputValue('ep_number');

            const season = seasonRaw ? (parseInt(seasonRaw, 10) || null) : null;
            const ep = parseInt(epRaw, 10);

            await interaction.deferReply({ ephemeral: true });

            if (Number.isNaN(ep) || ep < 0) {
                return await interaction.editReply("Please enter a valid, non-negative episode number.");
            }

            // Fetch metadata from provider (we haven't saved it yet)
            const animeData = await animeService.getAnimeFromProvider(providerId);
            if (!animeData) {
                return await interaction.editReply("That title no longer exists on Kitsu.");
            }

            // Map statusKey to human status
            const statusMap = {
                'WATCHING': 'Watching',
                'ON_HOLD': 'On Hold',
                'DROPPED': 'Dropped'
            };
            const status = statusMap[statusKey] || 'Watching';

            // Save anime first, then save progress in one or two calls
            await animeService.addAnimeToLibrary(animeData, status);

            // Update progress fields
            await animeService.updateProgress(providerId, {
                currentEntry: season,
                currentEpisode: ep,
                status: status,
                eventType: `Added as ${status}`
            });

            await interaction.editReply({ content: `✅ Saved **${animeData.englishTitle}** as ${status} (ep ${ep}${animeData.episodeCount ? `/${animeData.episodeCount}` : ''}).` });
            await this.dashboardService.recoverOrcreate();
        }
    }

    buildPreviewEmbed(anime) {
        return new EmbedBuilder()
            .setTitle(anime.englishTitle)
            .setURL(`https://kitsu.io/anime/${anime.providerId}`)
            .setDescription(anime.synopsis?.substring(0, 400) + '...')
            .setThumbnail(anime.posterUrl)
            .addFields(
                { name: '⭐ Rating', value: `${anime.communityRating || 'N/A'}`, inline: true },
                { name: '📅 Year', value: `${anime.year || 'N/A'}`, inline: true },
                { name: '📺 Episodes', value: `${anime.episodeCount || '?'}`, inline: true }
            )
            .setColor('#f1c40f');
    }

    buildStatusSelect(userId, providerId) {
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`status_select:${userId}:${providerId}`)
            .setPlaceholder('Choose a status')
            .addOptions([
                { label: 'Completed', value: 'COMPLETED', description: 'I finished this anime' },
                { label: 'Currently Watching', value: 'WATCHING', description: 'I am watching this now' },
                { label: 'On Hold', value: 'ON_HOLD', description: 'Paused for now' },
                { label: 'Plan to Watch', value: 'PLAN', description: 'I plan to watch this' },
                { label: 'Dropped', value: 'DROPPED', description: 'I dropped this' },
                { label: 'Cancel', value: 'CANCEL', description: 'Do not add' }
            ]);

        return new ActionRowBuilder().addComponents(menu);
    }

    // Handle the select menu interaction
    async handleSelectMenu(interaction) {
        // customId format: status_select:{userId}:{providerId}
        const [prefix, userId, providerIdStr] = interaction.customId.split(':');
        const providerId = parseInt(providerIdStr, 10);

        // Ensure only the original user may act on this select.
        if (interaction.user.id !== userId) {
            await interaction.reply({ content: "This selection isn't for you.", ephemeral: true });
            return;
        }

        // Prevent re-use: disable the menu immediately in the original message
        try {
            const disabledRow = interaction.message.components.map(row => {
                const components = row.components.map(c => ({ ...c, disabled: true }));
                return new ActionRowBuilder().addComponents(...components);
            });
            await interaction.update({ content: interaction.message.content, embeds: interaction.message.embeds, components: disabledRow });
        } catch (e) {
            logger.debug('Failed to disable components after selection:', e);
        }

        const selected = interaction.values && interaction.values[0];
        if (!selected || selected === 'CANCEL') {
            // Nothing to save — user cancelled.
            await interaction.followUp({ content: 'Cancelled. No changes were made.', ephemeral: true });
            return;
        }

        // Load cached preview to avoid a provider call.
        const cacheKey = `${interaction.user.id}:${providerId}`;
        const animeData = previewCache.get(cacheKey);
        if (!animeData) {
            await interaction.followUp({ content: "Preview expired — please search again.", ephemeral: true });
            return;
        }

        // For statuses that require progress, prompt via the existing progress modal
        if (['WATCHING', 'ON_HOLD', 'DROPPED'].includes(selected)) {
            // Reuse existing modal flow that collects season & episode.
            await this.showProgressModal(interaction, providerId, selected);
            return;
        }

        // Immediate-save statuses: PLAN and COMPLETED
        if (selected === 'PLAN') {
            try {
                await animeService.addAnimeToLibrary(animeData, 'Plan To Watch');
                await interaction.followUp({ content: `✅ Saved **${animeData.englishTitle}** as Plan To Watch.`, ephemeral: true });
                await this.dashboardService.recoverOrcreate();
            } catch (err) {
                logger.error('Failed to save plan:', err);
                await interaction.followUp({ content: 'Failed to save — please try again later.', ephemeral: true });
            }
            return;
        }

        if (selected === 'COMPLETED') {
            try {
                await animeService.addAnimeToLibrary(animeData, 'Completed');
                if (animeData.episodeCount) {
                    await animeService.updateProgress(providerId, {
                        currentEpisode: animeData.episodeCount,
                        status: 'Completed',
                        eventType: 'Added as Completed'
                    });
                }
                await interaction.followUp({ content: `✅ Saved **${animeData.englishTitle}** as Completed.`, ephemeral: true });
                await this.dashboardService.recoverOrcreate();
            } catch (err) {
                logger.error('Failed to save completed:', err);
                await interaction.followUp({ content: 'Failed to save — please try again later.', ephemeral: true });
            }
            return;
        }
    }

    // Optionally: helper to disable components and mark interaction expired (called by any timeout logic).
    async markInteractionExpired(message) {
        try {
            const disabledRow = message.components.map(row => {
                const components = row.components.map(c => ({ ...c, disabled: true }));
                return new ActionRowBuilder().addComponents(...components);
            });
            await message.edit({ content: `${message.content}\n\nThis interaction has expired.`, components: disabledRow });
        } catch (e) {
            logger.debug('Failed to mark interaction expired:', e);
        }
    }
}

module.exports = InteractionHandler;
