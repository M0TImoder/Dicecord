import { loadEnvironment } from "./config/environment.js";
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

async function bootstrap()
{
    try
    {
        registerProcessHandlers();

        const environment = loadEnvironment();
        activeCore = new DicecordCore({
            token: environment.token
        });

        await activeCore.start();
    }
    catch (error)
    {
        console.error("Dicecord failed to start.", error);
        process.exit(1);
    }
}

bootstrap();
