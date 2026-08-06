const { EmbedBuilder } = require('discord.js');
const ui = require('../../constants/ui');

/**
 * buildBaseEmbed: minimal wrapper to create a consistent embed across the app.
 * - title: string
 * - color: hex string
 * - thumbnail: url
 * - footer: { text, iconURL }
 * - timestamp: boolean | Date
 * - fields: [{ name, value, inline }]
 * - description: string
 */
function buildBaseEmbed({ title, color = ui.colors.system, thumbnail, footer, timestamp = true, fields = [], description }) {
  const embed = new EmbedBuilder()
    .setTitle(title || '')
    .setColor(color)
    .setDescription(description || '')
    .setTimestamp(timestamp === true ? new Date() : (timestamp instanceof Date ? timestamp : undefined));

  if (thumbnail) embed.setThumbnail(thumbnail);
  if (footer) embed.setFooter(footer);

  if (fields && Array.isArray(fields) && fields.length) {
    embed.addFields(fields.map(f => ({ name: f.name, value: f.value, inline: !!f.inline })));
  }

  return embed;
}

module.exports = { buildBaseEmbed };
