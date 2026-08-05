const LOBE_SVG = 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.64.0/icons';

type VendorIcon =
  | { mode: 'color'; file: string }
  | { mode: 'mono'; file: string; color: string; adaptive?: boolean };

/** OpenRouter author slug → filled Lobe brand icon (color SVG or mono + tint). */
const BY_AUTHOR: Record<string, VendorIcon> = {
  ai21: { mode: 'color', file: 'ai21-brand-color' },
  'aion-labs': { mode: 'color', file: 'aionlabs-color' },
  amazon: { mode: 'color', file: 'aws-color' },
  anthropic: { mode: 'color', file: 'claude-color' },
  baai: { mode: 'color', file: 'huggingface-color' },
  baidu: { mode: 'color', file: 'baidu-color' },
  bytedance: { mode: 'color', file: 'bytedance-color' },
  'bytedance-seed': { mode: 'color', file: 'bytedance-color' },
  cohere: { mode: 'color', file: 'cohere-color' },
  deepseek: { mode: 'color', file: 'deepseek-color' },
  google: { mode: 'color', file: 'gemini-color' },
  'ibm-granite': { mode: 'mono', file: 'ibm', color: '#054ADA' },
  intfloat: { mode: 'color', file: 'huggingface-color' },
  meta: { mode: 'color', file: 'meta-color' },
  'meta-llama': { mode: 'color', file: 'meta-color' },
  microsoft: { mode: 'color', file: 'azure-color' },
  minimax: { mode: 'color', file: 'minimax-color' },
  mistralai: { mode: 'color', file: 'mistral-color' },
  moonshotai: { mode: 'color', file: 'kimi-color' },
  nousresearch: { mode: 'mono', file: 'nousresearch', color: '#7C3AED' },
  nvidia: { mode: 'color', file: 'nvidia-color' },
  openai: { mode: 'mono', file: 'openai', color: '#10A37F' },
  openrouter: { mode: 'mono', file: 'openrouter', color: '#6566F1' },
  perplexity: { mode: 'color', file: 'perplexity-color' },
  qwen: { mode: 'color', file: 'qwen-color' },
  'sentence-transformers': { mode: 'color', file: 'huggingface-color' },
  stepfun: { mode: 'color', file: 'stepfun-color' },
  tencent: { mode: 'color', file: 'tencent-color' },
  thenlper: { mode: 'color', file: 'huggingface-color' },
  upstage: { mode: 'color', file: 'upstage-color' },
  voyageai: { mode: 'color', file: 'voyage-color' },
  'x-ai': { mode: 'mono', file: 'xai', color: '#111111', adaptive: true },
  'z-ai': { mode: 'color', file: 'zhipu-color' },
};

export type ResolvedLlmVendorIcon =
  | { mode: 'color'; src: string }
  | { mode: 'mono'; src: string; color: string; adaptive?: boolean };

const VENDOR_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  'meta-llama': 'Meta Llama',
  meta: 'Meta',
  mistralai: 'Mistral',
  'x-ai': 'xAI',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  cohere: 'Cohere',
  perplexity: 'Perplexity',
  nvidia: 'NVIDIA',
  amazon: 'Amazon',
  microsoft: 'Microsoft',
  voyageai: 'Voyage',
  openrouter: 'OpenRouter',
  moonshotai: 'Moonshot',
  'z-ai': 'Zhipu',
};

function vendorLabel(slug: string): string {
  if (VENDOR_LABELS[slug]) return VENDOR_LABELS[slug];
  return slug
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export const LLM_VENDOR_OPTIONS = Object.keys(BY_AUTHOR)
  .sort((a, b) => vendorLabel(a).localeCompare(vendorLabel(b)))
  .map((value) => ({ value, label: vendorLabel(value) }));

/** Author slug from `vendor` or OpenRouter `author/model` id. */
export function vendorFromModelSlug(modelOrVendor?: string | null): string | null {
  if (!modelOrVendor) return null;
  const author = modelOrVendor.split('/')[0]?.replace(/^~/, '').trim().toLowerCase();
  return author || null;
}

export function resolveLlmVendorIcon(modelOrVendor?: string | null): ResolvedLlmVendorIcon | null {
  const author = vendorFromModelSlug(modelOrVendor);
  if (!author) return null;
  const icon = BY_AUTHOR[author];
  if (!icon) return null;
  const src = `${LOBE_SVG}/${icon.file}.svg`;
  return icon.mode === 'color'
    ? { mode: 'color', src }
    : { mode: 'mono', src, color: icon.color, adaptive: icon.adaptive };
}
