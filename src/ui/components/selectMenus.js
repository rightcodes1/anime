const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const domain = require('../../constants/libraryDomain');

function buildLibrarySelectMenu() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('library_select')
    .setPlaceholder('Browse library categories')
    .addOptions(Object.entries(domain.CATEGORY_CONFIG).map(([key, cfg]) => ({
      label: cfg.title,
      value: key,
      emoji: cfg.icon
    })));

  return new ActionRowBuilder().addComponents(menu);
}

module.exports = { buildLibrarySelectMenu };
