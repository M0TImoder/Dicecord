import path from "node:path";
import { pathToFileURL } from "node:url";
import { readdir, stat } from "node:fs/promises";

export class PluginLoader
{
    constructor(options)
    {
        if (!options?.pluginManager)
        {
            throw new Error("Plugin manager is required for PluginLoader.");
        }

        this.logger = options.logger ?? console;
        this.pluginManager = options.pluginManager;
    }

    // 指定ディレクトリからプラグインを読み込む
    async loadFromDirectory(directoryPath)
    {
        if (!directoryPath)
        {
            throw new Error("Directory path is required for plugin loading.");
        }

        let entries;

        try
        {
            entries = await readdir(directoryPath, { withFileTypes: true });
        }
        catch (error)
        {
            this.log("error", `Failed to read plugin directory ${directoryPath}.`, error);
            throw error;
        }

        for (const entry of entries)
        {
            if (entry.isFile() && entry.name.endsWith(".js"))
            {
                await this.loadFile(path.join(directoryPath, entry.name));
            }
            else if (entry.isDirectory())
            {
                const candidate = path.join(directoryPath, entry.name, "index.js");

                if (await this.pathExists(candidate))
                {
                    await this.loadFile(candidate);
                }
            }
        }
    }

    // 単一のファイルを読み込む
    async loadFile(filePath)
    {
        try
        {
            const moduleUrl = pathToFileURL(filePath).href;
            const imported = await import(moduleUrl);
            const descriptor = this.extractDescriptor(imported);

            if (!descriptor)
            {
                this.log("warn", `Plugin file ${filePath} did not export a descriptor.`);
                return;
            }

            this.pluginManager.register(descriptor);
        }
        catch (error)
        {
            this.log("error", `Failed to load plugin file ${filePath}.`, error);
        }
    }

    // import結果からプラグイン定義を取り出す
    extractDescriptor(imported)
    {
        if (!imported)
        {
            return null;
        }

        if (imported.default && typeof imported.default === "object")
        {
            return imported.default;
        }

        if (imported.plugin && typeof imported.plugin === "object")
        {
            return imported.plugin;
        }

        if (typeof imported === "object")
        {
            return imported;
        }

        return null;
    }

    // ファイルパスの存在を確認する
    async pathExists(candidate)
    {
        try
        {
            const stats = await stat(candidate);
            return stats.isFile();
        }
        catch (error)
        {
            if (error.code === "ENOENT")
            {
                return false;
            }

            throw error;
        }
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
}
