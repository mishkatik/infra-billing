import { z } from 'zod';
import { rateSourceSchema } from '../enums';
import { currencySchema, isoDateSchema } from './common';

export const settingsSchema = z.object({
  baseCurrency: currencySchema.describe('Base currency for analytics'),
  syncIntervalHours: z.number().int().positive().describe('Auto-sync interval in hours'),
  // When the next scheduled autosync will run (read-only; not part of the update payload).
  nextSyncAt: isoDateSchema.describe('Next scheduled autosync').nullable(),
  rateSource: rateSourceSchema.describe('Exchange rate source'),
  // Telegram notifications. The bot token is NEVER returned — only whether it's set.
  notificationsEnabled: z.boolean().describe('Telegram notifications enabled'),
  upcomingBillingDays: z
    .number()
    .int()
    .positive()
    .describe('Upcoming billing alert window in days'),
  telegramChatId: z.string().describe('Telegram chat ID').nullable(),
  telegramTopicId: z.string().describe('Telegram topic ID').nullable(),
  telegramConfigured: z.boolean().describe('Bot token is set'),
});
export type Settings = z.infer<typeof settingsSchema>;

export const updateSettingsSchema = z.object({
  baseCurrency: currencySchema.describe('Base currency for analytics').optional(),
  syncIntervalHours: z.number().int().positive().describe('Auto-sync interval in hours').optional(),
  rateSource: rateSourceSchema.describe('Exchange rate source').optional(),
  notificationsEnabled: z.boolean().describe('Telegram notifications enabled').optional(),
  upcomingBillingDays: z
    .number()
    .int()
    .min(1)
    .max(60)
    .describe('Upcoming billing alert window in days')
    .optional(),
  // Plaintext token to set/update; empty string or omitted = keep the existing token.
  telegramBotToken: z.string().describe('Telegram bot token').optional(),
  // Empty string clears the field.
  telegramChatId: z.string().describe('Telegram chat ID').optional(),
  telegramTopicId: z.string().describe('Telegram topic ID').optional(),
});
export type UpdateSettings = z.infer<typeof updateSettingsSchema>;
