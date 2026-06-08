import { Telegraf } from 'telegraf';
import { config, isTelegramEnabled } from '../config';
import { createBot } from './bot';

let bot: Telegraf | null = null;

/**
 * Launch the Telegram bot in long-polling mode. No-op when the integration is
 * not configured, so the app keeps running without a bot token.
 */
export function startTelegramBot(): void {
  if (!isTelegramEnabled()) {
    // eslint-disable-next-line no-console
    console.log(
      '[telegram] Integration disabled (set TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME to enable).'
    );
    return;
  }

  bot = createBot();

  bot
    .launch(() => {
      // eslint-disable-next-line no-console
      console.log(`[telegram] Bot @${config.telegram.botUsername} started (long polling).`);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[telegram] Failed to launch bot:', err);
    });

  process.once('SIGINT', () => bot?.stop('SIGINT'));
  process.once('SIGTERM', () => bot?.stop('SIGTERM'));
}

export { createBot };
