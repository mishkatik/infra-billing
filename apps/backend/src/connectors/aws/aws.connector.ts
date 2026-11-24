import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  type GetCostAndUsageCommandOutput,
  type ResultByTime,
} from '@aws-sdk/client-cost-explorer';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import {
  AWS_CURRENCY,
  type AwsDailyCost,
  awsCostWindow,
  flattenDailyCosts,
  isoDay,
  mapAwsPayments,
  mapAwsServices,
} from './aws.mapper';
import type { AwsCredentials } from './aws.types';

const COST_EXPLORER_REGION = 'us-east-1';
const COST_METRIC = 'NetUnblendedCost';

export class AwsConnector implements Connector {
  private readonly client: CostExplorerClient;
  private readonly window = awsCostWindow(new Date());
  private cachedCosts?: AwsDailyCost[];

  constructor(creds: AwsCredentials) {
    this.client = new CostExplorerClient({
      region: COST_EXPLORER_REGION,
      credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
      maxAttempts: 1,
      requestHandler: { requestTimeout: REQUEST_TIMEOUT_MS },
    });
  }

  kind(): string {
    return 'aws';
  }

  async fetchAccount(): Promise<Account> {
    return { balance: null, currency: AWS_CURRENCY };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    return mapAwsServices(await this.dailyCosts(signal), this.window);
  }

  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    return mapAwsPayments(await this.dailyCosts(signal), this.window);
  }

  private async dailyCosts(signal: AbortSignal): Promise<AwsDailyCost[]> {
    if (this.cachedCosts) return this.cachedCosts;
    const results: ResultByTime[] = [];
    let nextPageToken: string | undefined;
    do {
      const page = await this.costAndUsagePage(nextPageToken, signal);
      results.push(...(page.ResultsByTime ?? []));
      nextPageToken = page.NextPageToken;
    } while (nextPageToken);
    this.cachedCosts = flattenDailyCosts(results, COST_METRIC);
    return this.cachedCosts;
  }

  private async costAndUsagePage(
    nextPageToken: string | undefined,
    signal: AbortSignal,
  ): Promise<GetCostAndUsageCommandOutput> {
    const command = new GetCostAndUsageCommand({
      TimePeriod: { Start: isoDay(this.window.start), End: isoDay(this.window.end) },
      Granularity: 'DAILY',
      Metrics: [COST_METRIC],
      GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
      NextPageToken: nextPageToken,
    });
    try {
      return await this.client.send(command, { abortSignal: signal });
    } catch (e) {
      throw awsError(e);
    }
  }
}

function awsError(e: unknown): Error {
  if (!(e instanceof Error)) return new Error(`AWS: ${String(e)}`);
  switch (e.name) {
    case 'DataUnavailableException':
      return new Error(
        'AWS: Cost Explorer has no data yet. Enable it in Billing and Cost Management → Cost Explorer; data appears within 24 hours',
      );
    case 'AccessDeniedException':
      return new Error('AWS: the IAM user needs the ce:GetCostAndUsage permission');
    case 'UnrecognizedClientException':
    case 'InvalidSignatureException':
    case 'InvalidClientTokenId':
      return new Error('AWS: invalid access key ID or secret access key');
    default:
      return new Error(`AWS: ${e.message}`);
  }
}
