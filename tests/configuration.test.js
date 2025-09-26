import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfiguration } from "../src/config/configuration.js";

// 一時的に環境変数を差し替える
async function withTemporaryEnvironment(values, callback)
{
    const previous = new Map();

    for (const [key, value] of Object.entries(values))
    {
        previous.set(key, process.env[key]);
        process.env[key] = value;
    }

    try
    {
        await callback();
    }
    finally
    {
        for (const [key, value] of previous.entries())
        {
            if (value === undefined)
            {
                delete process.env[key];
            }
            else
            {
                process.env[key] = value;
            }
        }
    }
}

test("設定ファイルが環境値を補完する", async () =>
{
    await withTemporaryEnvironment({
        DICECORD_TOKEN: "env-token",
        DICECORD_LOG_LEVEL: "warn",
        DICECORD_RETRY_LIMIT: "3",
        DICECORD_RETRY_INITIAL_MS: "2000",
        DICECORD_RETRY_MAX_MS: "30000"
    }, async () =>
    {
        const tempDir = await mkdtemp(path.join(tmpdir(), "dicecord-config-"));
        const configDir = path.join(tempDir, "config");
        await mkdir(configDir, { recursive: true });

        const fileConfig = {
            logging:
            {
                level: "error",
                filePath: "./logs/output.log"
            },
            connection:
            {
                maximumRetries: 1,
                initialDelayMs: 100,
                maximumDelayMs: 500
            },
            pluginDirectories: [
                "src/plugins"
            ]
        };

        const filePath = path.join(configDir, "dicecord.config.json");
        await writeFile(filePath, JSON.stringify(fileConfig, null, 4), "utf8");

        try
        {
            const configuration = await loadConfiguration({ configDirectory: tempDir });

            assert.equal(configuration.token, "env-token");
            assert.equal(configuration.logLevel, "warn");
            assert.equal(configuration.logFilePath, path.resolve(tempDir, "./logs/output.log"));
            assert.deepEqual(configuration.pluginDirectories, [path.resolve(tempDir, "src/plugins")]);
            assert.equal(configuration.connection.maximumRetries, 3);
            assert.equal(configuration.connection.initialDelayMs, 2000);
            assert.equal(configuration.connection.maximumDelayMs, 30000);
        }
        finally
        {
            await rm(tempDir, { recursive: true, force: true });
        }
    });
});

test("設定値が不正な場合はエラーになる", async () =>
{
    await withTemporaryEnvironment({
        DICECORD_TOKEN: "env-token"
    }, async () =>
    {
        const tempDir = await mkdtemp(path.join(tmpdir(), "dicecord-config-"));
        const configDir = path.join(tempDir, "config");
        await mkdir(configDir, { recursive: true });

        const filePath = path.join(configDir, "dicecord.config.json");
        await writeFile(filePath, JSON.stringify({
            connection:
            {
                maximumRetries: -2
            }
        }, null, 4), "utf8");

        try
        {
            await assert.rejects(async () =>
            {
                await loadConfiguration({ configDirectory: tempDir });
            });
        }
        finally
        {
            await rm(tempDir, { recursive: true, force: true });
        }
    });
});
