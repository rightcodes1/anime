const { buildBaseEmbed } = require('./baseEmbed');
const ui = require('../../constants/ui');

/**
 * buildListEmbed: generic list-style embed where 'sections' is an array of
 * { name, value } entries. This keeps embed construction generic and reusable.
 */
function buildListEmbed({ title, color = ui.colors.system, thumbnail, footer, timestamp = true, sections = [] }) {
  const descriptionParts = [];
  for (const s of sections) {
    // Each section is expected to be a short block of text already formatted.
    descriptionParts.push(`**${s.title}**\n${s.body}`);
  }

  const description = descriptionParts.join('\n\n');

  return buildBaseEmbed({ title, color, thumbnail, footer, timestamp, description });
}

module.exports = { buildListEmbed };
