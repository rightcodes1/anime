const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const animeService = require('../services/animeService');
const logger = require('../utils/logger');

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
        } else if (customId.startsWith('add_')) {
            const providerId = parseInt(customId.split('_')[1], 10);
            await interaction.deferUpdate();

            const animeData = await animeService.getAnimeFromProvider(providerId);
            if (!animeData) {
                await interaction.editReply({ content: "That title no longer exists on Kitsu.", embeds: [], components: [] });
                return;
            }

            await animeService.addAnimeToLibrary(animeData, 'Watching');

            await interaction.editReply({
                content: `✅ Added **${animeData.englishTitle}** to your library!`,
                embeds: [],
                components: []
            });
            await this.dashboardService.recoverOrcreate();
        } else if (customId === 'cancel_search') {
            // This button lives on a message the interaction hasn't replied
            // to or deferred yet, so it must acknowledge + edit in one call.
            await interaction.update({ content: "Search cancelled.", embeds: [], components: [] });
        } else if (customId.startsWith('update_ep_')) {
            const providerId = customId.split('_')[2];
            await this.showEpisodeUpdateModal(interaction, providerId);
        }
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
            const row = this.buildPreviewButtons(anime.providerId);

            await interaction.editReply({
                content: "Is this the anime you're looking for?",
                embeds: [embed],
                components: [row]
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

    buildPreviewButtons(providerId) {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`add_${providerId}`)
                    .setLabel('Add to Library')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('cancel_search')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger)
            );
    }
}

module.exports = InteractionHandler;
