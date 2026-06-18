import { Button, Menu } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { countryFlag } from '@/utils/format';

// Flag is by country, not language: GB for English, RU for Russian.
const LANGS = [
  { code: 'en', label: 'English', country: 'GB' },
  { code: 'ru', label: 'Русский', country: 'RU' },
];

const Flag = ({ country }: { country: string }) => (
  <span style={{ fontSize: 16, lineHeight: 1 }}>{countryFlag(country)}</span>
);

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const active = LANGS.find((l) => l.code === current) ?? LANGS[0];

  return (
    <Menu shadow="md" width={160} position="bottom-end">
      <Menu.Target>
        <Button
          variant="subtle"
          color="gray"
          size="compact-sm"
          leftSection={<Flag country={active.country} />}
        >
          {active.code.toUpperCase()}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {LANGS.map((l) => (
          <Menu.Item
            key={l.code}
            onClick={() => void i18n.changeLanguage(l.code)}
            leftSection={<Flag country={l.country} />}
            rightSection={current === l.code ? <IconCheck size={14} /> : null}
          >
            {l.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
