import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { RateSource, Settings, UpdateSettings } from '@infra/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { SyncService } from '../sync/sync.service';

interface SettingsRow {
  baseCurrency: string;
  syncIntervalHours: number;
  rateSource: string;
  notificationsEnabled: boolean;
  upcomingBillingDays: number;
  telegramBotTokenEnc: Uint8Array | null;
  telegramChatId: string | null;
  telegramTopicId: string | null;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly sync: SyncService,
  ) {}

  /** Read the singleton settings row, seeding it with the schema column defaults on first access. */
  async get(): Promise<Settings> {
    const row = await this.prisma.settings.upsert({
      where: { id: 1 },
      update: {},
      // baseCurrency/rateSource/syncIntervalHours/upcomingBillingDays use the Prisma @default()s.
      create: { id: 1 },
    });
    return this.toDto(row);
  }

  async update(dto: UpdateSettings): Promise<Settings> {
    await this.get(); // ensure the row exists
    const data: Prisma.SettingsUpdateInput = {};
    if (dto.baseCurrency !== undefined) data.baseCurrency = dto.baseCurrency;
    if (dto.syncIntervalHours !== undefined) data.syncIntervalHours = dto.syncIntervalHours;
    if (dto.rateSource !== undefined) data.rateSource = dto.rateSource;
    if (dto.notificationsEnabled !== undefined)
      data.notificationsEnabled = dto.notificationsEnabled;
    if (dto.upcomingBillingDays !== undefined) data.upcomingBillingDays = dto.upcomingBillingDays;
    // Empty string clears chat/topic; the token is encrypted and only set when non-empty.
    if (dto.telegramChatId !== undefined) data.telegramChatId = dto.telegramChatId || null;
    if (dto.telegramTopicId !== undefined) data.telegramTopicId = dto.telegramTopicId || null;
    if (dto.telegramBotToken) data.telegramBotTokenEnc = this.crypto.encrypt(dto.telegramBotToken);

    const row = await this.prisma.settings.update({ where: { id: 1 }, data });
    // The autosync interval lives here now — re-arm the scheduler when it changes.
    if (dto.syncIntervalHours !== undefined) this.sync.reschedule(row.syncIntervalHours);
    return this.toDto(row);
  }

  private toDto(row: SettingsRow): Settings {
    return {
      baseCurrency: row.baseCurrency,
      syncIntervalHours: row.syncIntervalHours,
      nextSyncAt: this.sync.getNextSyncAt()?.toISOString() ?? null,
      rateSource: row.rateSource as RateSource,
      notificationsEnabled: row.notificationsEnabled,
      upcomingBillingDays: row.upcomingBillingDays,
      telegramChatId: row.telegramChatId,
      telegramTopicId: row.telegramTopicId,
      telegramConfigured: row.telegramBotTokenEnc != null, // never expose the token itself
    };
  }
}
