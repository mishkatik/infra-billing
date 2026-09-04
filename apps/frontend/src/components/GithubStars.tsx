import { IconBrandGithub, IconStarFilled } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { GITHUB_REPO_URL, useGithubStars } from '@/api/github';
import { Odometer } from '@/components/remocn/odometer';
import { Button } from '@/components/ui/button';

export function GithubStars() {
  const { t } = useTranslation();
  const { data: stars } = useGithubStars();

  if (stars == null) return null;

  return (
    <Button
      asChild
      variant="outline"
      size="sm"
      className="rounded-full hover:-translate-y-px hover:border-brand hover:shadow-[0_2px_12px_-6px_var(--brand)]"
      aria-label={t('app.starOnGithub')}
    >
      <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
        <IconBrandGithub className="size-4" />
        <span className="flex items-center gap-1.5">
          <IconStarFilled className="size-[13px] text-amber-400" />
          {/* Counter in the remocn github-stars style: an odometer with rolling digits. */}
          <Odometer value={stars} className="text-sm leading-none font-semibold" />
        </span>
      </a>
    </Button>
  );
}
