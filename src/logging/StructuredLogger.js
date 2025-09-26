import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getKnownLogLevels, isLogLevelEnabled, normalizeLogLevel } from "./LogLevel.js";

export class StructuredLogger
{
    constructor(options = {})
    {
        this.minimumLevel = this.determineMinimumLevel(options.minimumLevel ?? "info");
        this.includeTimestamp = options.includeTimestamp !== false;
        this.consoleTarget = options.console ?? console;
        this.appenders = [];
        this.fileStream = null;

        if (options.enableConsole !== false)
        {
            this.appenders.push({ type: "console", target: this.consoleTarget });
        }

        if (options.filePath)
        {
            this.fileStream = this.createFileStream(options.filePath);
            this.appenders.push({ type: "file", target: this.fileStream });
        }
    }

    // ログレベルを決定する
    determineMinimumLevel(level)
    {
        try
        {
            return normalizeLogLevel(level);
        }
        catch
        {
            const available = getKnownLogLevels().join(", ");
            throw new Error(`Unsupported log level: ${level}. Available levels: ${available}`);
        }
    }

    // ファイル出力を初期化する
    createFileStream(filePath)
    {
        const resolvedPath = resolve(filePath);
        const directory = dirname(resolvedPath);

        mkdirSync(directory, { recursive: true });

        return createWriteStream(resolvedPath, {
            flags: "a",
            encoding: "utf8"
        });
    }

    // 利用可能な形式でログを生成する
    formatEntry(level, message, detail)
    {
        const parts = [];

        if (this.includeTimestamp)
        {
            parts.push(new Date().toISOString());
        }

        parts.push(level.toUpperCase());
        parts.push(message);

        if (detail !== undefined)
        {
            parts.push(this.stringifyDetail(detail));
        }

        return parts.join(" | ");
    }

    // 詳細情報を文字列化する
    stringifyDetail(detail)
    {
        if (detail instanceof Error)
        {
            return detail.stack ?? detail.message;
        }

        if (typeof detail === "object")
        {
            try
            {
                return JSON.stringify(detail);
            }
            catch (error)
            {
                return `Failed to stringify detail: ${error}`;
            }
        }

        return String(detail);
    }

    // 指定レベルでログを出力する
    log(level, message, detail)
    {
        const normalizedLevel = normalizeLogLevel(level);

        if (!isLogLevelEnabled(normalizedLevel, this.minimumLevel))
        {
            return;
        }

        const entry = this.formatEntry(normalizedLevel, message, detail);

        for (const appender of this.appenders)
        {
            this.dispatchToAppender(appender, normalizedLevel, entry, detail);
        }
    }

    // コンソールを含む各出力に送出する
    dispatchToAppender(appender, level, entry, detail)
    {
        if (appender.type === "console")
        {
            this.emitToConsole(appender.target, level, entry, detail);
            return;
        }

        if (appender.type === "file")
        {
            appender.target.write(`${entry}\n`);
        }
    }

    // console互換APIで出力する
    emitToConsole(target, level, entry, detail)
    {
        const method = typeof target[level] === "function" ? target[level] : target.log;

        if (typeof method !== "function")
        {
            return;
        }

        if (detail !== undefined)
        {
            method.call(target, entry, detail);
        }
        else
        {
            method.call(target, entry);
        }
    }

    debug(message, detail)
    {
        this.log("debug", message, detail);
    }

    info(message, detail)
    {
        this.log("info", message, detail);
    }

    warn(message, detail)
    {
        this.log("warn", message, detail);
    }

    error(message, detail)
    {
        this.log("error", message, detail);
    }

    // リソースを解放する
    async close()
    {
        if (!this.fileStream)
        {
            return;
        }

        await new Promise((resolve, reject) =>
        {
            const targetStream = this.fileStream;

            function handleFinish()
            {
                targetStream.off("error", handleError);
                resolve();
            }

            function handleError(error)
            {
                targetStream.off("finish", handleFinish);
                reject(error);
            }

            targetStream.once("finish", handleFinish);
            targetStream.once("error", handleError);
            targetStream.end();
        });

        this.fileStream = null;
        this.appenders = this.appenders.filter((appender) => appender.type !== "file");
    }
}
