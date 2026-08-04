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

export function resolveLlmVendorIcon(model?: string | null): ResolvedLlmVendorIcon | null {
  if (!model) return null;
  const author = model.split('/')[0]?.replace(/^~/, '').trim().toLowerCase();
  if (!author) return null;
  const icon = BY_AUTHOR[author];
  if (!icon) return null;
  const src = `${LOBE_SVG}/${icon.file}.svg`;
  return icon.mode === 'color'
    ? { mode: 'color', src }
    : { mode: 'mono', src, color: icon.color, adaptive: icon.adaptive };
}
