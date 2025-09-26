import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { StructuredLogger } from "../logging/StructuredLogger.js";
import { PluginManager } from "./PluginManager.js";
import { PluginLoader } from "./PluginLoader.js";
import { ConnectionSupervisor } from "./ConnectionSupervisor.js";
import { EventDispatcher } from "./EventDispatcher.js";

export class DicecordCore
{
    constructor(configuration)
    {
        if (!configuration || !configuration.token)
        {
            throw new Error("Discord token is required for DicecordCore.");
        }

        this.configuration = configuration;
        this.logger = configuration.logger ?? new StructuredLogger({
            minimumLevel: configuration.logLevel ?? "info",
            filePath: configuration.logFilePath
        });
        this.pluginManager = new PluginManager({
            logger: this.logger
        });
        this.pluginLoader = new PluginLoader({
            logger: this.logger,
            pluginManager: this.pluginManager
        });
        this.isReady = false;

        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.MessageContent
            ],
            partials: [
                Partials.Channel
            ]
        });

        this.registerCoreEventHandlers();

        this.connectionSupervisor = new ConnectionSupervisor({
            client: this.client,
            token: this.configuration.token,
            logger: this.logger,
            maximumRetries: this.configuration.connection?.maximumRetries ?? 5,
            initialDelayMs: this.configuration.connection?.initialDelayMs ?? 1_000,
            maximumDelayMs: this.configuration.connection?.maximumDelayMs ?? 60_000
        });

        this.eventDispatcher = new EventDispatcher({
            client: this.client,
            logger: this.logger
        });
        this.eventDispatcher.initialize();
    }

    // Discordクライアントの標準イベントを束ねる
    registerCoreEventHandlers()
    {
        this.client.once(Events.ClientReady, () =>
        {
            this.isReady = true;
            this.log("info", `Connected as ${this.client.user?.tag ?? "unknown user"}.`);
            this.activatePlugins().catch((error) =>
            {
                this.log("error", "Plugin activation failed during ready sequence.", error);
            });
        });

        this.client.on("error", (error) =>
        {
            this.log("error", "Discord client error detected.", error);
        });

        this.client.on("shardError", (error) =>
        {
            this.log("error", "Websocket shard error detected.", error);
        });
    }

    // ログ出力窓口を集約する
    log(level, message, detail)
    {
        if (typeof this.logger.log === "function")
        {
            this.logger.log(level, message, detail);
            return;
        }

        const target = this.resolveLoggerTarget(level);

        if (detail)
        {
            target(message, detail);
        }
        else
        {
            target(message);
        }
    }

    // ログ出力先を解決する
    resolveLoggerTarget(level)
    {
        const candidate = this.logger[level];

        if (typeof candidate === "function")
        {
            return candidate.bind(this.logger);
        }

        if (typeof this.logger.log === "function")
        {
            return this.logger.log.bind(this.logger, `[${level}]`);
        }

        return console.log;
    }

    // プラグイン定義を登録する
    registerPlugin(pluginDescriptor)
    {
        return this.pluginManager.register(pluginDescriptor);
    }

    // プラグインを一括で有効化する
    async activatePlugins()
    {
        await this.pluginManager.activateAll({
            client: this.client,
            logger: this.logger
        });
    }

    // プラグインを一括で無効化する
    async deactivatePlugins()
    {
        await this.pluginManager.deactivateAll({
            client: this.client,
            logger: this.logger
        });
    }

    // プラグインディレクトリを走査する
    async loadPluginsFromDirectory(directoryPath)
    {
        await this.pluginLoader.loadFromDirectory(directoryPath);
    }

    // Discordクライアントへの接続を開始する
    async start()
    {
        if (typeof this.client.isReady === "function" && this.client.isReady())
        {
            this.log("warn", "Dicecord core is already connected. Skipping start.");
            return;
        }

        this.log("info", "Starting Dicecord core.");
        await this.connectionSupervisor.connect();
    }

    // Discordクライアントを安全に停止させる
    async shutdown()
    {
        if (!this.client)
        {
            return;
        }

        this.log("info", "Shutting down Dicecord core.");
        this.isReady = false;
        this.connectionSupervisor.clear();
        await this.deactivatePlugins();
        await this.client.destroy();

        if (typeof this.logger.close === "function")
        {
            await this.logger.close();
        }
    }
}
