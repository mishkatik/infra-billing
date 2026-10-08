import { IconBrandGithub, IconStar } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { GITHUB_REPO_URL, useGithubStars } from '@/api/github';
import { Button } from '@/components/ui/button';

export function GithubStars() {
  const { t } = useTranslation();
  const { data: stars } = useGithubStars();

  if (stars == null) return null;

  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 font-normal"
      aria-label={t('app.starOnGithub')}
    >
      <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
        <IconBrandGithub stroke={1.5} className="size-4" />
        <IconStar stroke={1.5} className="size-3.5" />
        <span className="leading-none">{stars}</span>
      </a>
    </Button>
  );
}
