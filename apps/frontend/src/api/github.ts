import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

// Public GitHub REST calls go through plain axios on purpose: the shared `api` instance has a
// 401 → /login interceptor, and a GitHub auth/rate-limit error must not bounce the app to login.
export const GITHUB_REPO = 'mishkatik/infra-billing';
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`;
export const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`;
// Release tags are bare semver without a "v" prefix, so the version maps to the tag as is.
export const githubReleaseUrl = (version: string) => `${GITHUB_RELEASES_URL}/tag/${version}`;
export const githubCommitUrl = (sha: string) => `${GITHUB_REPO_URL}/commit/${sha}`;

const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}`;
const TIMEOUT = 10_000;
// Unauthenticated limit is 60 requests/hour per IP: an hour fresh, a day in cache, one retry.
const CACHE = { staleTime: 60 * 60 * 1000, gcTime: 24 * 60 * 60 * 1000, retry: 1 } as const;

export function useGithubStars() {
  return useQuery({
    queryKey: ['github-stars'],
    queryFn: async () =>
      (await axios.get<{ stargazers_count: number }>(GITHUB_API, { timeout: TIMEOUT })).data
        .stargazers_count,
    ...CACHE,
  });
}

/** Latest published release tag ("0.41.0"). Disabled for dev builds — nothing to compare against. */
export function useLatestRelease(enabled: boolean) {
  return useQuery({
    queryKey: ['github-latest-release'],
    queryFn: async () =>
      (
        await axios.get<{ tag_name: string }>(`${GITHUB_API}/releases/latest`, {
          timeout: TIMEOUT,
        })
      ).data.tag_name.replace(/^v/i, ''),
    enabled,
    ...CACHE,
  });
}
