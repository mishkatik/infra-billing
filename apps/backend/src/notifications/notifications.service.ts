import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import dayjs from 'dayjs';
import { NotificationLogRepository } from '@repositories/notification-log/notification-log.repository';
import { SettingsRepository } from '@repositories/settings/settings.repository';
import { SyncRunsRepository } from '@repositories/sync-runs/sync-runs.repository';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  lowBalanceMessage,
  lowRunwayMessage,
  overdueBillingMessage,
  sampleMessages,
  syncErrorMessage,
  upcomingBillingMessage,
} from './messages';
import { TelegramService } from './telegram.service';

const THROTTLE_HOURS = 24;
const DEFAULT_UPCOMING_BILLING_DAYS = 3; // fallback only, until the Settings row exists

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly settings: SettingsRepository,
    private readonly syncRuns: SyncRunsRepository,
    private readonly notificationLog: NotificationLogRepository,
    private readonly analytics: AnalyticsService,
    private readonly telegram: TelegramService,
  ) {}

  /** Evaluate alert conditions and send (throttled) Telegram messages. Returns count sent. */
  async checkAndNotify(): Promise<number> {
    if (!(await this.telegram.isEnabled())) return 0;

    const settings = await this.settings.find();
    const upcomingDays = settings?.upcomingBillingDays ?? DEFAULT_UPCOMING_BILLING_DAYS;
    const summary = await this.analytics.summary();
    let sent = 0;

    // 1) Low balance: a service whose imminent charge the provider balance won't cover
    //    (severity "critical": uncovered + due within ~a week, same definition as the dashboard).
    for (const ub of summary.upcomingBillings) {
      if (ub.severity !== 'critical') continue;
      const html = lowBalanceMessage(ub);
      if (await this.maybeSend(`low-balance:${ub.serviceUuid}`, html)) sent += 1;
    }

    // 1b) Low runway: a prepaid provider (no dated charge) whose balance is estimated to drain
    //     within ~3 days (severity "critical": same threshold as the dashboard runway card).
    for (const r of summary.balanceRunway) {
      if (r.severity !== 'critical') continue;
      const html = lowRunwayMessage(r);
      if (await this.maybeSend(`runway:${r.providerUuid}`, html)) sent += 1;
    }

    // 1c) Overdue: the billing date already passed. Dedup key has no date part, so like the
    //     low-balance alert it repeats daily (24h throttle) until paid or the date moves forward.
    for (const ob of summary.overdueBillings) {
      const html = overdueBillingMessage(ob);
      if (await this.maybeSend(`overdue:${ob.serviceUuid}`, html)) sent += 1;
    }

    // 2) Upcoming billings within N days.
    const horizon = dayjs().add(upcomingDays, 'day');
    for (const ub of summary.upcomingBillings) {
      if (dayjs(ub.nextBillingAt).isAfter(horizon)) continue;
      const day = dayjs(ub.nextBillingAt).format('YYYY-MM-DD');
      const html = upcomingBillingMessage(ub, day);
      if (await this.maybeSend(`upcoming:${ub.serviceUuid}:${day}`, html)) sent += 1;
    }

    // 3) Sync errors in the last 24h (one per provider).
    const since = dayjs().subtract(THROTTLE_HOURS, 'hour').toDate();
    const errorRuns = await this.syncRuns.listErrorsSince(since);
    const seenProviders = new Set<string>();
    for (const run of errorRuns) {
      if (seenProviders.has(run.providerUuid)) continue;
      seenProviders.add(run.providerUuid);
      const html = syncErrorMessage(
        run.provider.name,
        run.error ?? 'unknown error',
        run.provider.loginUrl,
      );
      if (await this.maybeSend(`sync-error:${run.providerUuid}`, html)) sent += 1;
    }

    if (sent > 0) this.logger.log(`Notifications sent: ${sent}`);
    return sent;
  }

  /** Send one sample of every notification type to preview formats. Ignores throttling. */
  async sendSamples(): Promise<number> {
    let sent = 0;
    for (const html of sampleMessages()) {
      if (await this.telegram.send(html)) sent += 1;
    }
    return sent;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async scheduled(): Promise<void> {
    try {
      await this.checkAndNotify();
    } catch (e) {
      this.logger.error('Notification check failed', e instanceof Error ? e.stack : String(e));
    }
  }

  /** Send only if the same dedup key hasn't been sent within THROTTLE_HOURS. */
  private async maybeSend(dedupKey: string, html: string): Promise<boolean> {
    const since = dayjs().subtract(THROTTLE_HOURS, 'hour').toDate();
    if (await this.notificationLog.wasSentSince(dedupKey, since)) return false;
    const ok = await this.telegram.send(html);
    if (ok) await this.notificationLog.record(dedupKey);
    return ok;
  }
}
