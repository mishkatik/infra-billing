import { Injectable } from '@nestjs/common';
import { AezaConnector } from './aeza/aeza.connector';
import { FourVpsConnector } from './4vps/4vps.connector';
import type { FourVpsCredentials } from './4vps/4vps.types';
import { BegetConnector } from './beget/beget.connector';
import type { BegetCredentials } from './beget/beget.types';
import { BillmgrConnector } from './billmgr/billmgr.connector';
import type { BillmgrCredentials } from './billmgr/billmgr.types';
import { CloudflareConnector } from './cloudflare/cloudflare.connector';
import type { CloudflareCredentials } from './cloudflare/cloudflare.types';
import { Connector } from './connector.interface';
import { HetznerConnector } from './hetzner/hetzner.connector';
import { HostbillConnector } from './hostbill/hostbill.connector';
import type { HostbillCredentials } from './hostbill/hostbill.types';
import { LinodeConnector } from './linode/linode.connector';
import { NetcupConnector } from './netcup/netcup.connector';
import { NetlenConnector } from './netlen/netlen.connector';
import { PorkbunConnector } from './porkbun/porkbun.connector';
import type { PorkbunCredentials } from './porkbun/porkbun.types';
import { SelectelConnector } from './selectel/selectel.connector';
import type { SelectelCredentials } from './selectel/selectel.types';
import { StormwallConnector } from './stormwall/stormwall.connector';
import { TimewebConnector } from './timeweb/timeweb.connector';
import { VultrConnector } from './vultr/vultr.connector';

@Injectable()
export class ConnectorFactory {
  /**
   * Build a connector for a syncable provider kind. Throws for unknown kinds and
   * for `manual` (manual providers are not synced; the sync skips them upstream).
   */
  create(kind: string, token: string): Connector {
    switch (kind) {
      case 'timeweb':
        return new TimewebConnector(token);
      case 'hetzner':
        return new HetznerConnector(token);
      case 'netlen':
        // Netlen secret is the raw API key (single string, sent as the X-API-Key header).
        return new NetlenConnector(token);
      case 'netcup':
        // netcup secret is the OAuth2 offline refresh token (single string, like timeweb).
        return new NetcupConnector(token);
      case 'hostbill':
        // For HostBill the decrypted secret is JSON: { baseUrl, username, password }.
        return new HostbillConnector(JSON.parse(token) as HostbillCredentials);
      case 'billmgr':
        // BILLmanager secret is JSON: { baseUrl, username, password }.
        return new BillmgrConnector(JSON.parse(token) as BillmgrCredentials);
      case 'selectel':
        // Selectel secret is JSON: { accountId, username, password } (Keystone service user).
        return new SelectelConnector(JSON.parse(token) as SelectelCredentials);
      case '4vps':
        // 4VPS secret is JSON: { token, panelId? }.
        return new FourVpsConnector(JSON.parse(token) as FourVpsCredentials);
      case 'beget':
        // Beget secret is JSON: { username (login), password, totpSecret?, apiPassword? }.
        return new BegetConnector(JSON.parse(token) as BegetCredentials);
      case 'porkbun':
        // Porkbun secret is JSON: { apiKey, secretApiKey } (X-API-Key / X-Secret-API-Key headers).
        return new PorkbunConnector(JSON.parse(token) as PorkbunCredentials);
      case 'vultr':
        // Vultr secret is the raw API key (single string, sent as the Authorization Bearer header).
        return new VultrConnector(token);
      case 'linode':
        // Linode secret is the raw Personal Access Token (sent as the Authorization Bearer header).
        return new LinodeConnector(token);
      case 'aeza':
        // Aeza secret is the raw API key (single string, sent as the X-API-KEY header).
        return new AezaConnector(token);
      case 'cloudflare':
        // Cloudflare secret is JSON: { accountId, apiToken } (account-scoped registrar + billing).
        return new CloudflareConnector(JSON.parse(token) as CloudflareCredentials);
      case 'stormwall':
        // StormWall secret is the raw API key (single string, sent as the x-api-key header).
        return new StormwallConnector(token);
      default:
        throw new Error(`Connector for kind="${kind}" is not supported`);
    }
  }
}
