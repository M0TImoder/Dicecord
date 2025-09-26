const LEVEL_PRIORITIES = new Map([
    ["debug", 10],
    ["info", 20],
    ["warn", 30],
    ["error", 40]
]);

export function normalizeLogLevel(level)
{
    if (typeof level !== "string")
    {
        throw new Error("Log level must be a string.");
    }

    const normalized = level.toLowerCase();

    if (!LEVEL_PRIORITIES.has(normalized))
    {
        throw new Error(`Unknown log level: ${level}`);
    }

    return normalized;
}

export function isLogLevelEnabled(candidateLevel, minimumLevel)
{
    const candidatePriority = LEVEL_PRIORITIES.get(candidateLevel);
    const minimumPriority = LEVEL_PRIORITIES.get(minimumLevel);

    if (candidatePriority === undefined || minimumPriority === undefined)
    {
        return false;
    }

    return candidatePriority >= minimumPriority;
}

export function getKnownLogLevels()
{
    return Array.from(LEVEL_PRIORITIES.keys());
}
