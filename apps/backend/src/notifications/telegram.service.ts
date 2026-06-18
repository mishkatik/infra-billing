import { Injectable, Logger } from '@nestjs/common';
import { Api } from 'grammy';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';

interface TelegramConfig {
  token: string;
  chatId: string;
  topicId: string;
}

/**
 * Outbound-only Telegram. Uses grammY's `Api` (no Bot/polling/webhook), HTML format. Config is
 * read dynamically from the in-panel settings (token AES-GCM encrypted) on every send, so changing
 * it in the panel takes effect without a restart. No env fallback — settings live in the DB.
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /** Effective Telegram config (token/chat) from the panel settings; null if not configured. */
  private resolveConfig(
    s: {
      telegramBotTokenEnc: Uint8Array | null;
      telegramChatId: string | null;
      telegramTopicId: string | null;
    } | null,
  ): TelegramConfig | null {
    if (s?.telegramBotTokenEnc && s.telegramChatId) {
      try {
        return {
          token: this.crypto.decrypt(s.telegramBotTokenEnc),
          chatId: s.telegramChatId,
          topicId: s.telegramTopicId ?? '',
        };
      } catch {
        this.logger.error('Failed to decrypt the Telegram token from settings');
      }
    }
    return null;
  }

  /** Automatic notifications are on only when the master switch is on AND config exists. */
  async isEnabled(): Promise<boolean> {
    const s = await this.prisma.settings.findUnique({ where: { id: 1 } });
    if (s && !s.notificationsEnabled) return false;
    return this.resolveConfig(s) !== null;
  }

  /** Send a message. Ignores the master switch (used by the manual "test" too). */
  async send(html: string): Promise<boolean> {
    const s = await this.prisma.settings.findUnique({ where: { id: 1 } });
    const cfg = this.resolveConfig(s);
    if (!cfg) return false;
    const options: { parse_mode: 'HTML'; message_thread_id?: number } = { parse_mode: 'HTML' };
    if (cfg.topicId) options.message_thread_id = Number(cfg.topicId);
    try {
      await new Api(cfg.token).sendMessage(cfg.chatId, html, options);
      return true;
    } catch (e) {
      this.logger.error(
        'Failed to send the Telegram notification',
        e instanceof Error ? e.stack : String(e),
      );
      return false;
    }
  }
}
