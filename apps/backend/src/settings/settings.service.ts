import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { RateSource, Settings, UpdateSettings } from '@infra/shared';
import { SettingsRepository } from '@repositories/settings/settings.repository';
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
  telegramProxyUrl: string | null;
  forecastTariffBackfill: boolean;
  forecastTariffBackfillRespectCreatedAt: boolean;
  forecastTariffBackfillBackdateFromPayments: boolean;
  forecastTariffBackfillForce: boolean;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly crypto: CryptoService,
    private readonly sync: SyncService,
  ) {}

  /** Read the singleton settings row, seeding it with the schema column defaults on first access. */
  async get(): Promise<Settings> {
    const row = await this.settings.ensure();
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
    if (dto.telegramProxyUrl !== undefined) data.telegramProxyUrl = dto.telegramProxyUrl || null;
    if (dto.telegramBotToken) data.telegramBotTokenEnc = this.crypto.encrypt(dto.telegramBotToken);
    if (dto.forecastTariffBackfill !== undefined)
      data.forecastTariffBackfill = dto.forecastTariffBackfill;
    if (dto.forecastTariffBackfillRespectCreatedAt !== undefined)
      data.forecastTariffBackfillRespectCreatedAt = dto.forecastTariffBackfillRespectCreatedAt;
    if (dto.forecastTariffBackfillBackdateFromPayments !== undefined)
      data.forecastTariffBackfillBackdateFromPayments = dto.forecastTariffBackfillBackdateFromPayments;
    if (dto.forecastTariffBackfillForce !== undefined)
      data.forecastTariffBackfillForce = dto.forecastTariffBackfillForce;

    const row = await this.settings.update(data);
    // The autosync interval lives here now. Re-arm the scheduler when it changes.
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
      telegramProxyUrl: row.telegramProxyUrl,
      telegramConfigured: row.telegramBotTokenEnc != null, // never expose the token itself
      forecastTariffBackfill: row.forecastTariffBackfill,
      forecastTariffBackfillRespectCreatedAt: row.forecastTariffBackfillRespectCreatedAt,
      forecastTariffBackfillBackdateFromPayments: row.forecastTariffBackfillBackdateFromPayments,
      forecastTariffBackfillForce: row.forecastTariffBackfillForce,
    };
  }
}
