-- Schema Version Table
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
);

-- Anime Metadata Table
CREATE TABLE IF NOT EXISTS anime (
    kitsu_id INTEGER PRIMARY KEY,
    english_title TEXT,
    romaji_title TEXT,
    japanese_title TEXT,
    synopsis TEXT,
    poster_url TEXT,
    cover_url TEXT,
    banner_url TEXT,
    genres TEXT, -- Stored as JSON string
    tags TEXT,   -- Stored as JSON string
    studios TEXT, -- Stored as JSON string
    status TEXT,
    start_date TEXT,
    end_date TEXT,
    season TEXT,
    year INTEGER,
    episode_count INTEGER,
    episode_duration INTEGER,
    format TEXT,
    popularity INTEGER,
    community_rating REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User Progress Table
CREATE TABLE IF NOT EXISTS anime_progress (
    kitsu_id INTEGER PRIMARY KEY,
    status TEXT NOT NULL, -- Watching, Completed, On Hold, Dropped, Plan To Watch
    current_entry TEXT,   -- For "Watching" status (e.g., Season 2)
    current_episode INTEGER DEFAULT 0,
    rating REAL,
    rewatch_count INTEGER DEFAULT 0,
    is_favorite INTEGER DEFAULT 0, -- 0 or 1
    last_watched_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kitsu_id) REFERENCES anime(kitsu_id)
);

-- Personal Notes Table
CREATE TABLE IF NOT EXISTS anime_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kitsu_id INTEGER NOT NULL,
    note TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kitsu_id) REFERENCES anime(kitsu_id)
);

-- History Timeline Table
CREATE TABLE IF NOT EXISTS anime_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kitsu_id INTEGER NOT NULL,
    event_type TEXT NOT NULL, -- Added, Status Changed, Episode Updated, Rated, etc.
    event_data TEXT, -- JSON string for extra info
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kitsu_id) REFERENCES anime(kitsu_id)
);

-- Dashboard Messages Table
CREATE TABLE IF NOT EXISTS dashboard_messages (
    message_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    embed_type TEXT NOT NULL, -- Main, Stats, etc.
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- API Cache Table
CREATE TABLE IF NOT EXISTS api_cache (
    cache_key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires_at DATETIME NOT NULL
);
