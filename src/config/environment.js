import { config as loadDotenv } from "dotenv";
import { getKnownLogLevels, normalizeLogLevel } from "../logging/LogLevel.js";

const TOKEN_KEY = "DICECORD_TOKEN";
const LOG_LEVEL_KEY = "DICECORD_LOG_LEVEL";
const LOG_FILE_KEY = "DICECORD_LOG_FILE";
const RETRY_LIMIT_KEY = "DICECORD_RETRY_LIMIT";
const RETRY_INITIAL_KEY = "DICECORD_RETRY_INITIAL_MS";
const RETRY_MAX_KEY = "DICECORD_RETRY_MAX_MS";

export function loadEnvironment()
{
    loadDotenv();

    const token = process.env[TOKEN_KEY];

    if (!token)
    {
        throw new Error(`${TOKEN_KEY} is not set in the environment.`);
    }

    const configuration = {
        token
    };

    const rawLogLevel = process.env[LOG_LEVEL_KEY];

    if (rawLogLevel)
    {
        try
        {
            configuration.logLevel = normalizeLogLevel(rawLogLevel);
        }
        catch
        {
            const knownLevels = getKnownLogLevels().join(", ");
            throw new Error(`${LOG_LEVEL_KEY} must be one of: ${knownLevels}`);
        }
    }

    const logFilePath = process.env[LOG_FILE_KEY];

    if (logFilePath)
    {
        configuration.logFilePath = logFilePath;
    }

    const connection = {};

    if (process.env[RETRY_LIMIT_KEY])
    {
        connection.maximumRetries = parseInteger(RETRY_LIMIT_KEY, process.env[RETRY_LIMIT_KEY]);
    }

    if (process.env[RETRY_INITIAL_KEY])
    {
        connection.initialDelayMs = parseInteger(RETRY_INITIAL_KEY, process.env[RETRY_INITIAL_KEY]);
    }

    if (process.env[RETRY_MAX_KEY])
    {
        connection.maximumDelayMs = parseInteger(RETRY_MAX_KEY, process.env[RETRY_MAX_KEY]);
    }

    if (Object.keys(connection).length > 0)
    {
        configuration.connection = connection;
    }

    return configuration;
}

// 数値環境変数を検証する
function parseInteger(key, rawValue)
{
    const parsed = Number.parseInt(rawValue, 10);

    if (Number.isNaN(parsed) || parsed < -1)
    {
        throw new Error(`${key} は-1以上の整数で指定してください。`);
    }

    return parsed;
}
