import { config as loadDotenv } from "dotenv";

const TOKEN_KEY = "DICECORD_TOKEN";

export function loadEnvironment()
{
    loadDotenv();

    const token = process.env[TOKEN_KEY];

    if (!token)
    {
        throw new Error(`${TOKEN_KEY} is not set in the environment.`);
    }

    return {
        token
    };
}
