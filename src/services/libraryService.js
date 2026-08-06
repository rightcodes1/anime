const libraryDomain = require('../constants/libraryDomain');
const progressRepository = require('../repositories/progressRepository');

/**
 * LibraryService: exposes methods to fetch paged category data for the UI.
 * Keeps SQL contained in repositories and uses business-level concepts.
 */
class LibraryService {
  constructor() {}

  // categoryKey: keys from libraryDomain.CATEGORY_CONFIG
  async getCategoryPage(categoryKey, page = 1, pageSize = libraryDomain.defaults.pageSize) {
    const filter = { category: categoryKey };
    const pagination = { page, pageSize };
    const sort = { field: libraryDomain.LibrarySort.UPDATED, direction: 'DESC' };

    const items = await progressRepository.getLibraryPage({ filter, pagination, sort });
    const total = await progressRepository.countLibraryItems({ filter });
    const pages = Math.max(1, Math.ceil(total / pageSize));

    return { items, total, page, pages };
  }

  // Convenience wrappers
  async getFavorites(page = 1) {
    return this.getCategoryPage('favorites', page);
  }

  async getRecentlyUpdated(page = 1) {
    const filter = {};
    const pagination = { page, pageSize: libraryDomain.defaults.pageSize };
    const sort = { field: libraryDomain.LibrarySort.UPDATED, direction: 'DESC' };
    const items = await progressRepository.getLibraryPage({ filter, pagination, sort });
    const total = await progressRepository.countLibraryItems({ filter });
    const pages = Math.max(1, Math.ceil(total / pagination.pageSize));
    return { items, total, page, pages };
  }

  async getCurrentlyWatching(page = 1) {
    return this.getCategoryPage('watching', page);
  }

  async getCompleted(page = 1) {
    return this.getCategoryPage('completed', page);
  }

  async getOnHold(page = 1) {
    return this.getCategoryPage('on_hold', page);
  }

  async getDropped(page = 1) {
    return this.getCategoryPage('dropped', page);
  }

  async getPlanToWatch(page = 1) {
    return this.getCategoryPage('plan', page);
  }

  // Expose stats via repository
  async getStats() {
    return progressRepository.getStats();
  }
}

module.exports = new LibraryService();
