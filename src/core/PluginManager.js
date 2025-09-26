import { EventEmitter } from "node:events";

export class PluginManager extends EventEmitter
{
    constructor(options)
    {
        super();

        this.logger = options?.logger ?? console;
        this.plugins = [];
    }

    // プラグイン定義を記録する
    register(descriptor)
    {
        if (!descriptor || typeof descriptor !== "object")
        {
            throw new Error("Plugin descriptor must be an object.");
        }

        if (!descriptor.name)
        {
            throw new Error("Plugin descriptor must include a name property.");
        }

        if (this.plugins.find((plugin) => plugin.name === descriptor.name))
        {
            throw new Error(`Plugin with name ${descriptor.name} is already registered.`);
        }

        const entry = {
            name: descriptor.name,
            activate: descriptor.activate,
            deactivate: descriptor.deactivate,
            events: descriptor.events,
            status: "registered",
            eventBindings: []
        };

        this.plugins.push(entry);
        this.log("info", `Registered plugin ${descriptor.name}.`);
        this.emit("registered", entry);

        return entry;
    }

    // 登録済みプラグインを順に有効化する
    async activateAll(context)
    {
        for (const plugin of this.plugins)
        {
            if (plugin.status !== "registered")
            {
                continue;
            }

            const pluginContext = this.createPluginContext(context, plugin);

            if (typeof plugin.activate !== "function")
            {
                plugin.status = "active";
                this.log("info", `Plugin ${plugin.name} has no activate hook. Marked as active.`);
                this.bindDeclaredEvents(plugin, pluginContext);
                continue;
            }

            try
            {
                await plugin.activate(pluginContext);
                plugin.status = "active";
                this.log("info", `Activated plugin ${plugin.name}.`);
                this.bindDeclaredEvents(plugin, pluginContext);
                this.emit("activated", plugin);
            }
            catch (error)
            {
                plugin.status = "error";
                this.log("error", `Failed to activate plugin ${plugin.name}.`, error);
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

            if (typeof plugin.deactivate !== "function")
            {
                this.teardownEvents(plugin, context?.client);
                plugin.status = "registered";
                this.log("info", `Plugin ${plugin.name} has no deactivate hook. Marked as registered.`);
                continue;
            }

            try
            {
                await plugin.deactivate(pluginContext);
                plugin.status = "registered";
                this.log("info", `Deactivated plugin ${plugin.name}.`);
                this.emit("deactivated", plugin);
            }
            catch (error)
            {
                plugin.status = "error";
                this.log("error", `Failed to deactivate plugin ${plugin.name}.`, error);
                this.emit("deactivationFailed", plugin, error);
            }
            finally
            {
                this.teardownEvents(plugin, context?.client);
            }
        }
    }

    // プラグイン一覧を返す
    list()
    {
        return this.plugins.map((plugin) => ({
            name: plugin.name,
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
        const context = {
            ...(baseContext ?? {}),
            plugin: {
                name: plugin.name
            }
        };

        context.log = (level, message, detail) =>
        {
            this.log(level, `[${plugin.name}] ${message}`, detail);
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
            this.log("warn", `Plugin ${plugin.name} could not register event ${eventName} because client is unavailable.`);
            return noop;
        }

        if (typeof eventName !== "string" || eventName.length === 0)
        {
            this.log("warn", `Plugin ${plugin.name} attempted to register an invalid event name.`);
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
                this.log("error", `Plugin ${plugin.name} handler for ${eventName} threw an error.`, error);
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
}

function noop()
{
}
