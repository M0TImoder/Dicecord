import { Client, GatewayIntentBits, Partials } from "discord.js";

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
        this.plugins = [];
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

    registerCoreEventHandlers()
    {
        this.client.once("ready", () =>
        {
            this.isReady = true;
            this.log("info", `Connected as ${this.client.user?.tag ?? "unknown user"}.`);
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

    registerPlugin(pluginDescriptor)
    {
        if (!pluginDescriptor || !pluginDescriptor.name)
        {
            throw new Error("Plugin descriptor must define a name.");
        }

        if (this.plugins.find((plugin) => plugin.name === pluginDescriptor.name))
        {
            throw new Error(`Plugin with name ${pluginDescriptor.name} is already registered.`);
        }

        this.plugins.push({
            ...pluginDescriptor,
            status: "registered"
        });

        this.log("info", `Registered plugin ${pluginDescriptor.name}.`);
    }

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

    async shutdown()
    {
        if (!this.client)
        {
            return;
        }

        this.log("info", "Shutting down Dicecord core.");
        this.isReady = false;
        this.loginPromise = null;
        await this.client.destroy();
    }
}
