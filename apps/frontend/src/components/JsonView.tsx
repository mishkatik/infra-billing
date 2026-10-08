import type { ReactNode } from 'react';

// Quiet highlighting: no syntax rainbow, just text tones — keys in the main colour, strings in
// the secondary one, literals italic, null faint; punctuation stays faint (see <pre> below).
const CLS = {
  key: 'text-foreground',
  string: 'text-ink-2',
  number: 'text-foreground',
  boolean: 'italic text-foreground',
  nul: 'text-ink-3',
};

// Tokenize pretty-printed JSON into colored spans. Safe by construction (no innerHTML).
function highlight(json: string): ReactNode[] {
  const re =
    /("(?:\\.|[^"\\])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (let m = re.exec(json); m !== null; m = re.exec(json)) {
    if (m.index > last) out.push(json.slice(last, m.index));
    const tok = m[0];
    let cls: string;
    if (tok.startsWith('"')) cls = tok.trimEnd().endsWith(':') ? CLS.key : CLS.string;
    else if (tok === 'true' || tok === 'false') cls = CLS.boolean;
    else if (tok === 'null') cls = CLS.nul;
    else cls = CLS.number;
    out.push(
      <span key={key} className={cls}>
        {tok}
      </span>,
    );
    key += 1;
    last = re.lastIndex;
  }
  if (last < json.length) out.push(json.slice(last));
  return out;
}

/** Pretty, syntax-highlighted, scrollable view of an arbitrary JSON value. */
export function JsonView({ data, maxHeight = 460 }: { data: unknown; maxHeight?: number }) {
  const text = JSON.stringify(data, null, 2);
  return (
    <pre
      className="m-0 overflow-auto rounded-lg bg-background p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-ink-3"
      style={{ maxHeight }}
    >
      {highlight(text)}
    </pre>
  );
}
