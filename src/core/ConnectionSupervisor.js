import { Events } from "discord.js";

// 接続状態を監視し再接続戦略を適用する
export class ConnectionSupervisor
{
    constructor(options)
    {
        if (!options?.client)
        {
            throw new Error("client が指定されていません。");
        }

        if (!options?.token)
        {
            throw new Error("token が指定されていません。");
        }

        this.client = options.client;
        this.token = options.token;
        this.logger = options.logger ?? console;
        this.maximumRetries = options.maximumRetries ?? 5;
        this.initialDelayMs = options.initialDelayMs ?? 1_000;
        this.maximumDelayMs = options.maximumDelayMs ?? 60_000;
        this.currentAttempt = 0;
        this.activeTimer = null;
        this.connectPromise = null;

        this.registerSupervisionHandlers();
    }

    // 接続処理をまとめる
    async connect()
    {
        if (this.connectPromise)
        {
            return this.connectPromise;
        }

        this.currentAttempt = 0;
        this.connectPromise = this.performLogin();

        try
        {
            await this.connectPromise;
        }
        finally
        {
            this.connectPromise = null;
        }
    }

    // 実際のログインを行い失敗時に再試行する
    async performLogin()
    {
        let delay = this.initialDelayMs;

        while (this.maximumRetries < 0 || this.currentAttempt <= this.maximumRetries)
        {
            try
            {
                this.currentAttempt += 1;
                this.log("info", `接続を試行します(${this.currentAttempt}回目)。`);
                await this.client.login(this.token);
                this.log("info", `接続に成功しました(${this.currentAttempt}回目)。`);
                return;
            }
            catch (error)
            {
                this.log("error", `接続試行に失敗しました(${this.currentAttempt}回目)。`, error);

                if (this.maximumRetries >= 0 && this.currentAttempt >= this.maximumRetries)
                {
                    throw error;
                }

                this.log("warn", `再試行まで ${delay} ミリ秒待機します。`);
                await this.wait(delay);
                delay = Math.min(delay * 2, this.maximumDelayMs);
            }
        }
    }

    // shardイベントなどを監視する
    registerSupervisionHandlers()
    {
        this.client.on(Events.ShardDisconnect, (event, shardId) =>
        {
            this.log("warn", `Shard ${shardId} が切断されました。`, event);
            this.scheduleReconnect();
        });

        this.client.on(Events.ShardError, (error, shardId) =>
        {
            this.log("error", `Shard ${shardId} でエラーが発生しました。`, error);
            this.scheduleReconnect();
        });

        this.client.on(Events.ShardReady, (shardId) =>
        {
            this.log("info", `Shard ${shardId} が ready になりました。`);
        });

        this.client.on(Events.ShardResume, (shardId, replayedEvents) =>
        {
            this.log("info", `Shard ${shardId} が再開しました(${replayedEvents}件再生)。`);
        });

        this.client.on(Events.Invalidated, () =>
        {
            this.log("warn", "セッションが無効化されました。再接続を開始します。");
            this.scheduleReconnect({ immediate: true });
        });
    }

    // 再接続をスケジュールする
    scheduleReconnect(options = {})
    {
        if (this.activeTimer)
        {
            return;
        }

        const delay = options.immediate ? 0 : this.initialDelayMs;

        this.activeTimer = setTimeout(() =>
        {
            this.activeTimer = null;
            this.forceReconnect();
        }, delay);
    }

    // クライアントを破棄してから再接続する
    async forceReconnect()
    {
        try
        {
            await this.client.destroy();
        }
        catch (error)
        {
            this.log("error", "再接続前の破棄に失敗しました。", error);
        }

        try
        {
            await this.connect();
        }
        catch (error)
        {
            this.log("error", "再接続に失敗しました。", error);
        }
    }

    // タイマー解除をまとめる
    clear()
    {
        if (this.activeTimer)
        {
            clearTimeout(this.activeTimer);
            this.activeTimer = null;
        }
    }

    // 一定時間待機する
    wait(duration)
    {
        return new Promise((resolve) =>
        {
            setTimeout(resolve, duration);
        });
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
