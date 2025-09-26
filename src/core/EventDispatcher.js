import { Events } from "discord.js";

// Discordイベントを横断的に監視する
export class EventDispatcher
{
    constructor(options)
    {
        if (!options?.client)
        {
            throw new Error("client が指定されていません。");
        }

        this.client = options.client;
        this.logger = options.logger ?? console;
        this.registered = false;
    }

    // 代表的なイベントの監視を開始する
    initialize()
    {
        if (this.registered)
        {
            return;
        }

        this.client.on(Events.InteractionCreate, (interaction) =>
        {
            if (interaction.isChatInputCommand?.())
            {
                this.log("debug", `スラッシュコマンドを受信しました(${interaction.commandName ?? "不明"})。`);
            }
            else if (interaction.isAutocomplete?.())
            {
                this.log("debug", "オートコンプリートを受信しました。");
            }
            else
            {
                this.log("debug", "未分類のインタラクションを受信しました。");
            }
        });

        this.client.on(Events.MessageCreate, (message) =>
        {
            if (message.partial)
            {
                this.log("warn", "パーシャルメッセージを受信しました。内容を取得できません。");
                return;
            }

            if (message.author?.bot)
            {
                return;
            }

            this.log("debug", "メッセージを受信しました。", {
                guildId: message.guild?.id ?? null,
                channelId: message.channel?.id ?? null
            });
        });

        this.client.on(Events.MessageReactionAdd, (reaction, user) =>
        {
            if (reaction.partial)
            {
                this.log("warn", "パーシャルリアクションを受信しました。内容を取得できません。");
                return;
            }

            this.log("debug", "リアクションが追加されました。", {
                emoji: reaction.emoji?.name ?? null,
                userId: user?.id ?? null
            });
        });

        this.registered = true;
    }

    // ログ出力窓口を統一する
    log(level, message, detail)
    {
        if (typeof this.logger.log === "function")
        {
            this.logger.log(level, message, detail);
            return;
        }

        const target = this.logger[level] ?? this.logger.log ?? console.log;

        if (detail !== undefined)
        {
            target.call(this.logger, message, detail);
        }
        else
        {
            target.call(this.logger, message);
        }
    }
}
