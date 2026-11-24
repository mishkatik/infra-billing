import { Injectable } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';
import type { NetcupDevicePollResult, NetcupDeviceStart } from '@infra/shared';
import { createHttp, REQUEST_TIMEOUT_MS } from '../common/http';

// netcup SCP OAuth2 (Keycloak realm `scp`). Single source for the connector + device flow.
const OIDC = 'https://www.servercontrolpanel.de/realms/scp/protocol/openid-connect';
export const NETCUP_TOKEN_URL = `${OIDC}/token`;
export const NETCUP_CLIENT_ID = 'scp';
const DEVICE_AUTH_URL = `${OIDC}/auth/device`;
const SCOPE = 'offline_access openid';
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

interface DeviceAuthResponse {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  verification_uri_complete?: string;
  interval?: number;
  expires_in?: number;
}

interface TokenResponse {
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

/**
 * In-panel OAuth2 device flow for netcup, so the owner gets a refresh token without any
 * external script: `start()` kicks off device authorization; the frontend opens the
 * verification URL and polls `poll()` until the user approves and a refresh token is minted.
 */
@Injectable()
export class NetcupDeviceFlowService {
  private readonly http: AxiosInstance = createHttp({
    timeout: REQUEST_TIMEOUT_MS,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  /** Begin device authorization → user_code + verification URL for the browser. */
  async start(): Promise<NetcupDeviceStart> {
    const body = new URLSearchParams({ client_id: NETCUP_CLIENT_ID, scope: SCOPE });
    const { data } = await this.http.post<DeviceAuthResponse>(DEVICE_AUTH_URL, body);
    if (!data?.device_code || !data?.user_code) {
      throw new Error('netcup: unexpected device authorization response');
    }
    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri ?? '',
      verificationUriComplete: data.verification_uri_complete ?? data.verification_uri ?? '',
      interval: data.interval && data.interval > 0 ? data.interval : 5,
      expiresIn: data.expires_in && data.expires_in > 0 ? data.expires_in : 600,
    };
  }

  /**
   * Exchange the device code for tokens once. Maps Keycloak's pending/terminal states to a
   * status the frontend can poll on. The token endpoint returns HTTP 400 while pending, so a
   * non-2xx is expected and parsed rather than thrown.
   */
  async poll(deviceCode: string): Promise<NetcupDevicePollResult> {
    const body = new URLSearchParams({
      grant_type: DEVICE_GRANT,
      device_code: deviceCode,
      client_id: NETCUP_CLIENT_ID,
    });
    let data: TokenResponse;
    try {
      const res = await this.http.post<TokenResponse>(NETCUP_TOKEN_URL, body);
      data = res.data;
    } catch (e) {
      // Keycloak returns HTTP 400 with a JSON `{ error }` body while pending. Parse that.
      // A non-object body (e.g. a proxy's 5xx HTML page) is treated as transient → rethrow.
      if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
        data = e.response.data as TokenResponse;
      } else {
        throw e;
      }
    }
    if (data.refresh_token) return { status: 'authorized', refreshToken: data.refresh_token };
    switch (data.error) {
      case 'authorization_pending':
      case 'slow_down':
        return { status: 'pending' };
      case 'expired_token':
        return { status: 'expired', message: 'Device code expired — start again' };
      case 'access_denied':
        return { status: 'denied', message: 'Authorization was declined' };
      default:
        return {
          status: 'error',
          message: data.error_description ?? data.error ?? 'unknown error',
        };
    }
  }
}
