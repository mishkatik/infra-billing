import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

// ISO 3166-1 alpha-2 codes. Names are resolved via Intl.DisplayNames in the active language.
const CODES =
  'AD AE AF AG AI AL AM AO AR AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(
    ' ',
  );

/** Localized country name for an ISO2 code (falls back to the code itself). */
export function countryName(code: string, lang: string): string {
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Country options { value: ISO2, label: "Russia" }, localized + sorted by name. */
export function useCountryOptions() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  return useMemo(
    () =>
      CODES.map((code) => ({ value: code, label: countryName(code, lang) })).sort((a, b) =>
        a.label.localeCompare(b.label, lang),
      ),
    [lang],
  );
}
