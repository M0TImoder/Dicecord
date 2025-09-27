import { z } from "zod";

export const SUPPORTED_PLUGIN_API_VERSION = "1.0.0";

const lifecycleHookSchema = z.custom((value) => typeof value === "function", {
    message: "Lifecycle hooks must be functions."
});

const eventHandlerSchema = z.custom((value) => typeof value === "function", {
    message: "Event handlers must be functions."
});

const compatibilitySchema = z.object({
    minimumCoreVersion: z.string().min(1).optional(),
    maximumCoreVersion: z.string().min(1).optional()
}).strict();

const manifestSchema = z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    apiVersion: z.string().min(1),
    description: z.string().optional(),
    compatibility: compatibilitySchema.optional()
}).strict();

const hooksSchema = z.object({
    onLoad: lifecycleHookSchema,
    onActivate: lifecycleHookSchema,
    onDeactivate: lifecycleHookSchema,
    onDispose: lifecycleHookSchema
}).strict();

const eventsSchema = z.record(z.string(), eventHandlerSchema).optional();

export const pluginDescriptorSchema = z.object({
    manifest: manifestSchema,
    hooks: hooksSchema,
    events: eventsSchema.optional(),
    exports: z.record(z.string(), z.any()).optional()
}).strict();

export function validatePluginDescriptor(descriptor)
{
    const parsed = pluginDescriptorSchema.parse(descriptor);

    if (parsed.manifest.apiVersion !== SUPPORTED_PLUGIN_API_VERSION)
    {
        throw new Error(`Unsupported plugin apiVersion ${parsed.manifest.apiVersion}. Expected ${SUPPORTED_PLUGIN_API_VERSION}.`);
    }

    return parsed;
}
