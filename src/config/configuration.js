import path from "node:path";
import { readFile } from "node:fs/promises";
import { loadEnvironment } from "./environment.js";
import { normalizeLogLevel, getKnownLogLevels } from "../logging/LogLevel.js";

const CONFIG_FILE_NAME = "dicecord.config.json";

export async function loadConfiguration(options = {})
{
    // 設定ファイル検索に利用する
    const configDirectory = options.configDirectory ?? process.cwd();
    const environment = loadEnvironment();

    const configuration = {
        token: environment.token,
        logLevel: environment.logLevel,
        logFilePath: environment.logFilePath,
        pluginDirectories: [],
        connection: environment.connection ? { ...environment.connection } : undefined
    };

    const configFilePath = path.join(configDirectory, "config", CONFIG_FILE_NAME);
    const fileConfig = await readConfigurationFile(configFilePath);

    if (fileConfig.logging)
    {
        applyLoggingSection(configuration, fileConfig.logging, configDirectory);
    }

    if (fileConfig.connection)
    {
        applyConnectionSection(configuration, fileConfig.connection);
    }

    if (Array.isArray(fileConfig.pluginDirectories))
    {
        configuration.pluginDirectories = fileConfig.pluginDirectories.map((directoryPath) =>
        {
            // 相対パスを解決する
            return path.resolve(configDirectory, directoryPath);
        });
    }

    return configuration;
}

async function readConfigurationFile(configFilePath)
{
    try
    {
        const raw = await readFile(configFilePath, "utf8");
        return JSON.parse(raw);
    }
    catch (error)
    {
        if (error.code === "ENOENT")
        {
            return {};
        }

        if (error instanceof SyntaxError)
        {
            throw new Error(`Failed to parse configuration file ${configFilePath}.`);
        }

        throw error;
    }
}

function applyLoggingSection(configuration, loggingConfig, configDirectory)
{
    if (loggingConfig.level && !configuration.logLevel)
    {
        try
        {
            configuration.logLevel = normalizeLogLevel(loggingConfig.level);
        }
        catch
        {
            const knownLevels = getKnownLogLevels().join(", ");
            throw new Error(`logging.level must be one of: ${knownLevels}`);
        }
    }

    if (loggingConfig.filePath && !configuration.logFilePath)
    {
        configuration.logFilePath = path.resolve(configDirectory, loggingConfig.filePath);
    }
}

function applyConnectionSection(configuration, connectionConfig)
{
    if (!configuration.connection)
    {
        configuration.connection = {};
    }

    if (connectionConfig.maximumRetries !== undefined && configuration.connection.maximumRetries === undefined)
    {
        configuration.connection.maximumRetries = coerceInteger("connection.maximumRetries", connectionConfig.maximumRetries);
    }

    if (connectionConfig.initialDelayMs !== undefined && configuration.connection.initialDelayMs === undefined)
    {
        configuration.connection.initialDelayMs = coerceInteger("connection.initialDelayMs", connectionConfig.initialDelayMs);
    }

    if (connectionConfig.maximumDelayMs !== undefined && configuration.connection.maximumDelayMs === undefined)
    {
        configuration.connection.maximumDelayMs = coerceInteger("connection.maximumDelayMs", connectionConfig.maximumDelayMs);
    }
}

function coerceInteger(fieldName, rawValue)
{
    const parsed = Number.parseInt(rawValue, 10);

    if (Number.isNaN(parsed) || parsed < -1)
    {
        throw new Error(`${fieldName} は-1以上の整数で指定してください。`);
    }

    return parsed;
}
