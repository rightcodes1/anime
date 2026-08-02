require("dotenv").config();

function validateEnv(key) {
    if (!process.env[key]) {
        console.error(`Error: Missing environment variable ${key}`);
        process.exit(1);
    }
    return process.env[key];
}

module.exports = {
    discord: {
        token: validateEnv("DISCORD_TOKEN"),
        channelId: validateEnv("ANIME_CHANNEL_ID"),
        clientId: validateEnv("CLIENT_ID"),
    },
    turso: {
        url: validateEnv("TURSO_DATABASE_URL"),
        authToken: validateEnv("TURSO_AUTH_TOKEN"),
    },
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,

    kitsu: {
        baseUrl: 'https://kitsu.io/api/edge',
    }
};
