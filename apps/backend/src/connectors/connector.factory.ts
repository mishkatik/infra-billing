import { Injectable } from '@nestjs/common';
import { FourVpsConnector } from './4vps/4vps.connector';
import type { FourVpsCredentials } from './4vps/4vps.types';
import { BillmgrConnector } from './billmgr/billmgr.connector';
import type { BillmgrCredentials } from './billmgr/billmgr.types';
import { Connector } from './connector.interface';
import { HetznerConnector } from './hetzner/hetzner.connector';
import { HostbillConnector } from './hostbill/hostbill.connector';
import type { HostbillCredentials } from './hostbill/hostbill.types';
import { SelectelConnector } from './selectel/selectel.connector';
import type { SelectelCredentials } from './selectel/selectel.types';
import { TimewebConnector } from './timeweb/timeweb.connector';

@Injectable()
export class ConnectorFactory {
  /**
   * Build a connector for a syncable provider kind. Throws for unknown kinds and
   * for `manual` (manual providers are not synced — the sync skips them upstream).
   */
  create(kind: string, token: string): Connector {
    switch (kind) {
      case 'timeweb':
        return new TimewebConnector(token);
      case 'hetzner':
        return new HetznerConnector(token);
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
      default:
        throw new Error(`Connector for kind="${kind}" is not supported`);
    }
  }
}
