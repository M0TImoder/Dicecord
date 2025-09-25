import { loadEnvironment } from "./config/environment.js";
import { DicecordCore } from "./core/DicecordCore.js";

async function bootstrap()
{
    try
    {
        const environment = loadEnvironment();
        const core = new DicecordCore({
            token: environment.token
        });

        await core.start();
    }
    catch (error)
    {
        console.error("Dicecord failed to start.", error);
        process.exit(1);
    }
}

bootstrap();
