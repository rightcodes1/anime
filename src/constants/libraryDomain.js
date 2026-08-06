module.exports = {
  // Map category keys used by the UI to database status strings and presentation bits.
  // Keep keys stable and minimal to satisfy repository lookups.
  CATEGORY_CONFIG: {
    watching:    { databaseStatus: 'Watching',       title: 'Currently Watching', icon: '▶️' },
    completed:   { databaseStatus: 'Completed',     title: 'Completed',          icon: '✅' },
    plan:        { databaseStatus: 'Plan To Watch', title: 'Plan To Watch',      icon: '📝' },
    on_hold:     { databaseStatus: 'On Hold',       title: 'On Hold',            icon: '⏸️' },
    dropped:     { databaseStatus: 'Dropped',       title: 'Dropped',            icon: '❌' },
    favorites:   { databaseStatus: null,            title: 'Favorites',          icon: '⭐' }
  },

  // Sort enum used by repository -> SQL mapping.
  LibrarySort: {
    UPDATED: 'UPDATED',
    EPISODE: 'EPISODE',
    REWATCHS: 'REWATCHS'
  },

  // Small defaults used by LibraryService / repository paging.
  defaults: {
    pageSize: 6,
    dashboardDebounceMs: 2000
  }
};
