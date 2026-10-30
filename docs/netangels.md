# NetAngels

Select `netangels` when adding a provider and enter an API key created in the
[NetAngels panel](https://panel.netangels.ru/) (API section). Enter the persistent
API key, not the short-lived gateway bearer token. Keys are encrypted using the
same storage as other token-based providers.

## What is synced

- Account balance in RUB (`GET /api/v1/account/info/`).
- Cloud VDS inventory, paginated with `limit` and `offset`
  (`GET /api/v1/cloud/vms/`). The stable external ID is the numeric VM ID.
- Current full monthly tariff from `GET /api/v1/cloud/vms/calculation/`, matched
  by `vm_name` to the VM's `uid`. This read-only endpoint is used by the official
  panel and was verified live; it is not listed in the public gateway docs.
  It includes storage, backup, IPv4 and other configured resource costs.
- VM state, tariff, IPs, primary disk size and backup flag as metadata.

The gateway exchanges the key with a form POST to
`https://panel.netangels.ru/api/gateway/token/`. The connector shares one bearer
between requests in a sync and refreshes it once if the API returns HTTP 401.
All subsequent requests are GET requests to `https://api-ms.netangels.ru`.

See the public [VM API](https://api.netangels.ru/modules/gateway_api.api.cloud.vms/)
and [account API](https://api.netangels.ru/modules/gateway_api.api.account.account/).

## Billing semantics and limits

NetAngels monthly estimates use 720 hours (30 days). Actual hourly charges vary
with calendar length. We store the provider's monthly estimate, not a rounded
hourly amount: the DB stores money with two decimal places, while hourly tariffs
can have four. Full hourly price is retained in metadata.

`full_month_price` is used even for a VM covered by a prepaid packet, whose
immediate `month_price` can be zero. Packet discounts, expiry and payment history
are not imported. This connector represents the recurring full tariff, not the
actual cash ledger. Next billing date is left unset rather than invented.

Stopped VMs remain in inventory because resources can still be charged. Deleted
VMs are excluded. A malformed/truncated response, duplicate pagination or missing
calculation fails the sync instead of returning a partial inventory or zero
prices. Unknown API fields are not copied to metadata. Only cloud VDS are synced;
other NetAngels products and unattached resources are outside this connector.

## Existing manual entries

Manual services are not automatically matched by their display names or IPs.
Keep a backup, sync a new NetAngels provider/account, verify the imported VM IDs
and totals, then deactivate the corresponding manual entries to avoid counting
them twice. Preserve manual payment history. Provider kind is immutable in the
current application, so existing manual providers should not be changed via SQL.
