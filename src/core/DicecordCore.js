import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { PluginManager } from "./PluginManager.js";
import { PluginLoader } from "./PluginLoader.js";

export class DicecordCore
{
    constructor(configuration)
    {
        if (!configuration || !configuration.token)
        {
            throw new Error("Discord token is required for DicecordCore.");
        }

        this.configuration = configuration;
        this.logger = configuration.logger ?? console;
        this.pluginManager = new PluginManager({
            logger: this.logger
        });
        this.pluginLoader = new PluginLoader({
            logger: this.logger,
            pluginManager: this.pluginManager
        });
        this.isReady = false;
        this.loginPromise = null;

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
        if (this.loginPromise)
        {
            return this.loginPromise;
        }

        this.log("info", "Starting Dicecord core.");

        this.loginPromise = this.client.login(this.configuration.token).catch((error) =>
        {
            this.log("error", "Login failed.", error);
            this.loginPromise = null;
            throw error;
        });

        return this.loginPromise;
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
        this.loginPromise = null;
        await this.deactivatePlugins();
        await this.client.destroy();
    }
}
