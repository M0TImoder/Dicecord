import { loadConfiguration } from "./config/configuration.js";
import { DicecordCore } from "./core/DicecordCore.js";

let activeCore = null;
let isShuttingDown = false;

// プロセスイベントを設定する
function registerProcessHandlers()
{
    async function handleShutdown(signal)
    {
        if (isShuttingDown)
        {
            return;
        }

        isShuttingDown = true;

        if (activeCore)
        {
            activeCore.log("info", `Received ${signal}. Initiating shutdown.`);

            try
            {
                await activeCore.shutdown();
            }
            catch (error)
            {
                activeCore.log("error", "Shutdown sequence failed.", error);
            }
        }

        process.exit(0);
    }

    process.once("SIGINT", function onSigint()
    {
        handleShutdown("SIGINT");
    });

    process.once("SIGTERM", function onSigterm()
    {
        handleShutdown("SIGTERM");
    });

    process.on("uncaughtException", function onUncaughtException(error)
    {
        if (activeCore)
        {
            activeCore.log("error", "Uncaught exception detected.", error);
        }
        else
        {
            console.error("Uncaught exception detected before core was ready.", error);
        }
    });

    process.on("unhandledRejection", function onUnhandledRejection(reason)
    {
        if (activeCore)
        {
            activeCore.log("error", "Unhandled promise rejection detected.", reason);
        }
        else
        {
            console.error("Unhandled promise rejection detected before core was ready.", reason);
        }
    });
}

// 設定ファイルに基づいてプラグインを事前登録する
async function loadConfiguredPlugins(core, configuration)
{
    // 設定済みディレクトリを順番に読み込む
    for (const directoryPath of configuration.pluginDirectories ?? [])
    {
        try
        {
            await core.loadPluginsFromDirectory(directoryPath);
        }
        catch (error)
        {
            core.log("error", `Failed to load plugins from ${directoryPath}.`, error);
        }
    }
}

async function bootstrap()
{
    try
    {
        registerProcessHandlers();

        const configuration = await loadConfiguration();
        activeCore = new DicecordCore(configuration);

        await loadConfiguredPlugins(activeCore, configuration);

        await activeCore.start();
    }
    catch (error)
    {
        console.error("Dicecord failed to start.", error);
        process.exit(1);
    }
}

bootstrap();
