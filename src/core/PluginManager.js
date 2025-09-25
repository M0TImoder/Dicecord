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
            status: "registered"
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

            if (typeof plugin.activate !== "function")
            {
                plugin.status = "active";
                this.log("info", `Plugin ${plugin.name} has no activate hook. Marked as active.`);
                continue;
            }

            try
            {
                await plugin.activate(context);
                plugin.status = "active";
                this.log("info", `Activated plugin ${plugin.name}.`);
                this.emit("activated", plugin);
            }
            catch (error)
            {
                plugin.status = "error";
                this.log("error", `Failed to activate plugin ${plugin.name}.`, error);
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

            if (typeof plugin.deactivate !== "function")
            {
                plugin.status = "registered";
                this.log("info", `Plugin ${plugin.name} has no deactivate hook. Marked as registered.`);
                continue;
            }

            try
            {
                await plugin.deactivate(context);
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
}
