const logger = require('../utils/logger');

/**
 * Dashboard interaction handler — keeps dashboard/navigation logic out of the
 * main InteractionHandler so InteractionHandler remains a thin dispatcher.
 *
 * Exports a single handler for pagination buttons and the library select menu.
 */

async function handleLibrarySelect(interaction, dashboardService) {
  // interaction is a StringSelectMenuInteraction with values
  const selected = interaction.values && interaction.values[0];
  if (!selected) {
    await interaction.reply({ content: 'No category selected.', ephemeral: true });
    return;
  }

  try {
    await interaction.deferUpdate();
    await dashboardService.renderCategory(selected, 1);
  } catch (e) {
    logger.error('Dashboard select handling failed:', e);
    try {
      await interaction.followUp({ content: 'Failed to load category — please try again.', ephemeral: true });
    } catch (_) {}
  }
}

async function handlePaginationButton(interaction, dashboardService) {
  // customId format: lib_prev:{categoryKey}:{page} (or lib_next, lib_page)
  const customId = interaction.customId || '';
  const parts = customId.split(':');
  const action = parts[0];
  const categoryKey = parts[1];
  const page = parseInt(parts[2], 10) || 1;

  let newPage = page;
  if (action === 'lib_prev') newPage = Math.max(1, page - 1);
  if (action === 'lib_next') newPage = page + 1;
  if (action === 'lib_page') {
    // informational disabled button — nothing to do
    return;
  }

  try {
    await interaction.deferUpdate();
    await dashboardService.renderCategory(categoryKey, newPage);
  } catch (e) {
    logger.error('Pagination handling failed:', e);
    try { await interaction.followUp({ content: 'Failed to change page.', ephemeral: true }); } catch (_) {}
  }
}

module.exports = { handleLibrarySelect, handlePaginationButton };
