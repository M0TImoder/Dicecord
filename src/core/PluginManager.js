import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { satisfies } from "semver";
import { SUPPORTED_PLUGIN_API_VERSION, validatePluginDescriptor } from "./PluginContract.js";

const require = createRequire(import.meta.url);
const packageInfo = require("../../package.json");

export class PluginManager extends EventEmitter
{
    constructor(options)
    {
        super();

        this.logger = options?.logger ?? console;
        this.coreVersion = options?.coreVersion ?? packageInfo.version ?? "0.0.0";
        this.eventBus = options?.eventBus ?? new EventEmitter();
        this.plugins = [];
        this.pluginStorage = new Map();
    }

    // プラグイン定義を記録する
    async register(descriptor)
    {
        const parsed = validatePluginDescriptor(descriptor);
        const identity = `${parsed.manifest.name}@${parsed.manifest.version}`;

        if (this.plugins.find((plugin) => plugin.identity === identity))
        {
            throw new Error(`Plugin with identity ${identity} is already registered.`);
        }

        this.assertCompatibility(parsed.manifest);

        const entry = {
            identity,
            manifest: parsed.manifest,
            hooks: parsed.hooks,
            events: parsed.events ?? {},
            exports: parsed.exports ?? {},
            status: "registered",
            eventBindings: []
        };

        this.plugins.push(entry);
        this.log("info", `Registered plugin ${entry.identity}.`);
        this.emit("registered", entry);

        try
        {
            const loadContext = this.createPluginContext({}, entry);
            await entry.hooks.onLoad(loadContext);
            entry.status = "loaded";
            this.log("info", `Loaded plugin ${entry.identity}.`);
            this.emit("loaded", entry);
        }
        catch (error)
        {
            entry.status = "error";
            this.log("error", `Failed to load plugin ${entry.identity}.`, error);
            this.emit("loadFailed", entry, error);
        }

        return entry;
    }

    // 登録済みプラグインを順に有効化する
    async activateAll(context)
    {
        for (const plugin of this.plugins)
        {
            if (plugin.status !== "loaded")
            {
                continue;
            }

            const pluginContext = this.createPluginContext(context, plugin);

            try
            {
                await plugin.hooks.onActivate(pluginContext);
                plugin.status = "active";
                this.log("info", `Activated plugin ${plugin.identity}.`);
                this.bindDeclaredEvents(plugin, pluginContext);
                this.emit("activated", plugin);
            }
            catch (error)
            {
                plugin.status = "error";
                this.log("error", `Failed to activate plugin ${plugin.identity}.`, error);
                this.teardownEvents(plugin, context?.client);
                this.emit("activationFailed", plugin, error);
            }
        }
    }

    // 有効状態のプラグインを順に無効化する
    async deactivateAll(context)
    {
        for (const plugin of this.plugins)
        {
            if (plugin.status !== "active")
            {
                continue;
            }

            const pluginContext = this.createPluginContext(context, plugin);

            try
            {
                await plugin.hooks.onDeactivate(pluginContext);
                plugin.status = "loaded";
                this.log("info", `Deactivated plugin ${plugin.identity}.`);
                this.emit("deactivated", plugin);
            }
            catch (error)
            {
                plugin.status = "error";
                this.log("error", `Failed to deactivate plugin ${plugin.identity}.`, error);
                this.emit("deactivationFailed", plugin, error);
            }
            finally
            {
                this.teardownEvents(plugin, context?.client);
            }
        }
    }

    // ロード済みプラグインを順に破棄する
    async disposeAll()
    {
        for (const plugin of this.plugins)
        {
            if (plugin.status === "disposed")
            {
                continue;
            }

            try
            {
                const disposeContext = this.createPluginContext({}, plugin);
                await plugin.hooks.onDispose(disposeContext);
                plugin.status = "disposed";
                this.log("info", `Disposed plugin ${plugin.identity}.`);
                this.emit("disposed", plugin);
            }
            catch (error)
            {
                plugin.status = "error";
                this.log("error", `Failed to dispose plugin ${plugin.identity}.`, error);
                this.emit("disposeFailed", plugin, error);
            }
        }
    }

    // プラグイン一覧を返す
    list()
    {
        return this.plugins.map((plugin) => ({
            identity: plugin.identity,
            manifest: plugin.manifest,
            status: plugin.status
        }));
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

    // プラグイン専用のコンテキストを生成する
    createPluginContext(baseContext, plugin)
    {
        const storage = this.getPluginStorage(plugin.identity);
        const logger = this.createNamespacedLogger(plugin.identity);
        const client = this.createClientFacade(baseContext?.client);

        const context = {
            manifest: plugin.manifest,
            core: {
                version: this.coreVersion,
                pluginApiVersion: SUPPORTED_PLUGIN_API_VERSION
            },
            logger,
            client,
            storage,
            eventBus: this.eventBus
        };

        context.registerEvent = (eventName, handler) =>
        {
            return this.bindEvent(plugin, baseContext?.client, eventName, handler, context);
        };

        return context;
    }

    // プラグイン定義に含まれるイベントを束ねる
    bindDeclaredEvents(plugin, pluginContext)
    {
        if (!pluginContext?.client)
        {
            return;
        }

        if (!plugin.events || typeof plugin.events !== "object")
        {
            return;
        }

        for (const [eventName, handler] of Object.entries(plugin.events))
        {
            this.bindEvent(plugin, pluginContext.client, eventName, handler, pluginContext);
        }
    }

    // イベントの登録を実行する
    bindEvent(plugin, client, eventName, handler, pluginContext)
    {
        if (!client || typeof client.on !== "function")
        {
            this.log("warn", `Plugin ${plugin.identity} could not register event ${eventName} because client is unavailable.`);
            return noop;
        }

        if (typeof eventName !== "string" || eventName.length === 0)
        {
            this.log("warn", `Plugin ${plugin.identity} attempted to register an invalid event name.`);
            return noop;
        }

        if (typeof handler !== "function")
        {
            this.log("warn", `Plugin ${plugin.name} attempted to register event ${eventName} without a handler.`);
            return noop;
        }

        const wrapped = (...args) =>
        {
            try
            {
                handler(pluginContext, ...args);
            }
            catch (error)
            {
                this.log("error", `Plugin ${plugin.identity} handler for ${eventName} threw an error.`, error);
            }
        };

        client.on(eventName, wrapped);
        plugin.eventBindings.push({
            eventName,
            listener: wrapped
        });

        return () =>
        {
            this.removeBinding(plugin, client, eventName, wrapped);
        };
    }

    // 登録済みイベントを解除する
    teardownEvents(plugin, client)
    {
        if (!plugin.eventBindings || plugin.eventBindings.length === 0)
        {
            return;
        }

        for (const binding of plugin.eventBindings)
        {
            this.removeBinding(plugin, client, binding.eventName, binding.listener);
        }

        plugin.eventBindings = [];
    }

    // イベント解除処理をまとめる
    removeBinding(plugin, client, eventName, listener)
    {
        if (!client)
        {
            return;
        }

        if (typeof client.off === "function")
        {
            client.off(eventName, listener);
        }
        else if (typeof client.removeListener === "function")
        {
            client.removeListener(eventName, listener);
        }

        plugin.eventBindings = plugin.eventBindings.filter((binding) => binding.listener !== listener);
    }
    
    // 互換性制約を確認する
    assertCompatibility(manifest)
    {
        if (!manifest.compatibility)
        {
            return;
        }

        const rangeParts = [];

        if (manifest.compatibility.minimumCoreVersion)
        {
            rangeParts.push(`>=${manifest.compatibility.minimumCoreVersion}`);
        }

        if (manifest.compatibility.maximumCoreVersion)
        {
            rangeParts.push(`<=${manifest.compatibility.maximumCoreVersion}`);
        }

        if (rangeParts.length === 0)
        {
            return;
        }

        const range = rangeParts.join(" ");

        if (!satisfies(this.coreVersion, range))
        {
            throw new Error(`Plugin ${manifest.name}@${manifest.version} is not compatible with Dicecord core ${this.coreVersion}. Expected ${range}.`);
        }
    }

    // プラグイン専用ストレージを返す
    getPluginStorage(identity)
    {
        if (!this.pluginStorage.has(identity))
        {
            this.pluginStorage.set(identity, new Map());
        }

        return this.pluginStorage.get(identity);
    }

    // プラグイン専用ロガーを生成する
    createNamespacedLogger(identity)
    {
        return {
            log: (level, message, detail) =>
            {
                this.log(level, `[${identity}] ${message}`, detail);
            },
            info: (message, detail) =>
            {
                this.log("info", `[${identity}] ${message}`, detail);
            },
            warn: (message, detail) =>
            {
                this.log("warn", `[${identity}] ${message}`, detail);
            },
            error: (message, detail) =>
            {
                this.log("error", `[${identity}] ${message}`, detail);
            }
        };
    }

    // プラグイン用に制限付きクライアントを生成する
    createClientFacade(client)
    {
        if (!client)
        {
            return {
                sendMessage: async () =>
                {
                    throw new Error("Discord client is not ready.");
                }
            };
        }

        return {
            sendMessage: async (channelId, payload) =>
            {
                const channel = await client.channels.fetch(channelId);

                if (!channel || typeof channel.isDMBased === "function" && channel.isDMBased())
                {
                    throw new Error("Plugins are not permitted to send direct messages.");
                }

                return channel.send(payload);
            },
            getGuild: (guildId) =>
            {
                return client.guilds.cache.get(guildId) ?? null;
            }
        };
    }
}

function noop()
{
}
