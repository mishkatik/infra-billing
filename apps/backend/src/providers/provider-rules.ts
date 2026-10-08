// Pure account-label and merge rules, kept free of Nest/Prisma so they can be tested directly.

interface MergeSide {
  uuid: string;
  kind: string;
}

interface LabelledAccount {
  uuid: string;
  label: string | null;
}

/**
 * Whether `label` is already used by another account of the same provider (case-insensitive).
 * null is the provider's original ("main") account, and there can only be one of those too.
 */
export function labelTaken(accounts: LabelledAccount[], label: string | null, exceptUuid?: string) {
  const key = label?.toLowerCase() ?? null;
  return accounts.some((a) => a.uuid !== exceptUuid && (a.label?.toLowerCase() ?? null) === key);
}

/** Why `source` can't be folded into `target`, or null when the merge is allowed. */
export function mergeError(source: MergeSide, target: MergeSide): string | null {
  if (source.uuid === target.uuid) return 'Cannot merge a provider into itself';
  if (source.kind !== target.kind) return 'Only providers of the same kind can be merged';
  return null;
}

/**
 * Labels the source accounts get on the target. The source's unlabelled ("main") account takes the
 * source provider name, so "Veesp 2" stays recognisable next to the target's own main account. A
 * label already used on the target (case-insensitive) gets a " (2)", " (3)"… suffix.
 */
export function mergedLabels(
  sourceName: string,
  sourceAccounts: LabelledAccount[],
  targetAccounts: LabelledAccount[],
): { uuid: string; label: string }[] {
  const taken = new Set(
    targetAccounts.flatMap((a) => (a.label === null ? [] : [a.label.toLowerCase()])),
  );
  return sourceAccounts.map((a) => {
    const wanted = (a.label ?? sourceName).trim();
    let label = fitLabel(wanted, '');
    for (let n = 2; taken.has(label.toLowerCase()); n++) label = fitLabel(wanted, ` (${n})`);
    taken.add(label.toLowerCase());
    return { uuid: a.uuid, label };
  });
}

// Same limit as the account label in the API, so a merged account stays editable.
const LABEL_MAX = 64;

function fitLabel(base: string, suffix: string): string {
  return `${base.slice(0, LABEL_MAX - suffix.length).trimEnd()}${suffix}`;
}

/** Identity fields the target is missing, filled from the source; the target's own values win. */
export function mergedIdentity<
  T extends {
    loginUrl: string | null;
    iconName: string | null;
    iconBg: string | null;
    faviconLink: string | null;
  },
>(source: T, target: T) {
  const fill: Partial<Pick<T, 'loginUrl' | 'iconName' | 'iconBg' | 'faviconLink'>> = {};
  for (const key of ['loginUrl', 'iconName', 'iconBg', 'faviconLink'] as const) {
    if (target[key] === null && source[key] !== null) fill[key] = source[key];
  }
  return fill;
}
