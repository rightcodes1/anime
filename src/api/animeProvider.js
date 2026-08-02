const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryable(error) {
    // Network-level failure (no response at all) or a 5xx from Kitsu.
    if (!error.response) return true;
    return error.response.status >= 500;
}

/**
 * @interface AnimeProvider
 */
class AnimeProvider {
    async search(query) { throw new Error('Not implemented'); }
    async getById(id) { throw new Error('Not implemented'); }
}

class KitsuProvider extends AnimeProvider {
    constructor() {
        super();
        this.client = axios.create({
            baseURL: config.kitsu.baseUrl,
            timeout: REQUEST_TIMEOUT_MS,
            headers: {
                'Accept': 'application/vnd.api+json',
                'Content-Type': 'application/vnd.api+json'
            }
        });
    }

    async _requestWithRetry(requestFn) {
        let lastError;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                return await requestFn();
            } catch (error) {
                lastError = error;
                if (attempt === MAX_RETRIES || !isRetryable(error)) {
                    throw error;
                }
                const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
                logger.warn(`Kitsu request failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms: ${error.message}`);
                await sleep(delay);
            }
        }
        throw lastError;
    }

    /**
     * @returns {Promise<Array>} matches, or [] if Kitsu genuinely had none
     * @throws if Kitsu is unreachable / erroring, so callers can show a
     *         distinct "search is temporarily unavailable" message instead
     *         of a misleading "no results found".
     */
    async search(query) {
        try {
            const response = await this._requestWithRetry(() => this.client.get('/anime', {
                params: {
                    'filter[text]': query,
                    'page[limit]': 10
                }
            }));
            return response.data.data.map(this._mapAnimeData);
        } catch (error) {
            logger.error('Kitsu Search Error:', error.message);
            throw new Error('KITSU_UNAVAILABLE');
        }
    }

    /**
     * @returns {Promise<Object|null>} null only on a confirmed 404 ("not found")
     * @throws for anything else (network/5xx), so callers can distinguish
     *         "this title doesn't exist" from "Kitsu is down right now".
     */
    async getById(id) {
        try {
            const response = await this._requestWithRetry(() => this.client.get(`/anime/${id}`));
            return this._mapAnimeData(response.data.data);
        } catch (error) {
            if (error.response?.status === 404) {
                return null;
            }
            logger.error(`Kitsu GetById Error (${id}):`, error.message);
            throw new Error('KITSU_UNAVAILABLE');
        }
    }

    _mapAnimeData(item) {
        const attr = item.attributes;
        return {
            providerId: parseInt(item.id),
            englishTitle: attr.titles.en || attr.titles.en_jp || attr.canonicalTitle,
            romajiTitle: attr.titles.en_jp || attr.canonicalTitle,
            japaneseTitle: attr.titles.ja_jp || '',
            synopsis: attr.synopsis,
            posterUrl: attr.posterImage?.large || attr.posterImage?.original,
            coverUrl: attr.coverImage?.large || attr.coverImage?.original,
            bannerUrl: attr.coverImage?.original,
            status: attr.status,
            startDate: attr.startDate,
            endDate: attr.endDate,
            episodeCount: attr.episodeCount,
            episodeLength: attr.episodeLength,
            format: attr.showType,
            popularity: attr.popularityRank,
            communityRating: parseFloat(attr.averageRating),
            year: attr.startDate ? new Date(attr.startDate).getFullYear() : null,
            season: attr.season
        };
    }
}

module.exports = {
    KitsuProvider,
    provider: new KitsuProvider()
};
