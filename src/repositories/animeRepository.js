async save(animeData) {
    const values = [
        animeData.providerId,
        animeData.englishTitle,
        animeData.romajiTitle,
        animeData.japaneseTitle,
        animeData.synopsis,
        animeData.posterUrl,
        animeData.coverUrl,
        animeData.bannerUrl,
        animeData.status,
        animeData.startDate,
        animeData.endDate,
        animeData.season,
        animeData.year,
        animeData.episodeCount,
        animeData.episodeLength,
        animeData.format,
        animeData.popularity,
        animeData.communityRating
    ];

    const fieldNames = [
        "providerId",
        "englishTitle",
        "romajiTitle",
        "japaneseTitle",
        "synopsis",
        "posterUrl",
        "coverUrl",
        "bannerUrl",
        "status",
        "startDate",
        "endDate",
        "season",
        "year",
        "episodeCount",
        "episodeLength",
        "format",
        "popularity",
        "communityRating"
    ];

    console.log("========== DEBUG ANIME DATA ==========");

    values.forEach((value, index) => {
        console.log({
            field: fieldNames[index],
            type: typeof value,
            value: value
        });
    });

    console.log("======================================");

    await db.execute({
        sql: `INSERT INTO anime (
            kitsu_id, english_title, romaji_title, japanese_title,
            synopsis, poster_url, cover_url, banner_url,
            status, start_date, end_date, season, year,
            episode_count, episode_duration, format, popularity, community_rating,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(kitsu_id) DO UPDATE SET
            english_title = excluded.english_title,
            romaji_title = excluded.romaji_title,
            japanese_title = excluded.japanese_title,
            synopsis = excluded.synopsis,
            poster_url = excluded.poster_url,
            cover_url = excluded.cover_url,
            banner_url = excluded.banner_url,
            status = excluded.status,
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            season = excluded.season,
            year = excluded.year,
            episode_count = excluded.episode_count,
            episode_duration = excluded.episode_duration,
            format = excluded.format,
            popularity = excluded.popularity,
            community_rating = excluded.community_rating,
            updated_at = CURRENT_TIMESTAMP`,
        args: values
    });

    return this.getById(animeData.providerId);
}
