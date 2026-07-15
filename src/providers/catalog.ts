export const REASONING_EFFORTS = [
  'auto',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];
export type GuiProviderId = 'claude' | 'codex';

export interface ProviderModelOption {
  id: string;
  label: string;
  description: string;
  defaultEffort: ReasoningEffort;
  efforts: readonly ReasoningEffort[];
}

export interface ProviderModelCatalogEntry {
  label: string;
  defaultModel: string;
  models: readonly ProviderModelOption[];
}

const CLAUDE_COMMON = ['auto', 'low', 'medium', 'high', 'max'] as const;
const CLAUDE_OPUS = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
const CODEX_STANDARD = ['auto', 'low', 'medium', 'high', 'xhigh'] as const;
const CODEX_MAX = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
const CODEX_ULTRA = ['auto', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const;

/**
 * GUI-safe aliases supported by the official CLIs. Account and workspace policy
 * can still restrict which entries are available at execution time.
 */
export const PROVIDER_MODEL_CATALOG: Record<GuiProviderId, ProviderModelCatalogEntry> = {
  claude: {
    label: 'Claude Code',
    defaultModel: 'default',
    models: [
      {
        id: 'default',
        label: 'Automatic (account default)',
        description: 'Uses the recommended Claude model for the signed-in account.',
        defaultEffort: 'auto',
        efforts: CLAUDE_OPUS,
      },
      {
        id: 'best',
        label: 'Best available',
        description: 'Uses the most capable Claude model available to the account.',
        defaultEffort: 'xhigh',
        efforts: CLAUDE_OPUS,
      },
      {
        id: 'opus',
        label: 'Claude Opus',
        description: 'For complex reasoning and high-value implementation work.',
        defaultEffort: 'xhigh',
        efforts: CLAUDE_OPUS,
      },
      {
        id: 'sonnet',
        label: 'Claude Sonnet',
        description: 'For everyday coding, review, and balanced agent work.',
        defaultEffort: 'high',
        efforts: CLAUDE_COMMON,
      },
      {
        id: 'haiku',
        label: 'Claude Haiku',
        description: 'Fast model for small, clearly scoped tasks.',
        defaultEffort: 'auto',
        efforts: ['auto'],
      },
      {
        id: 'opusplan',
        label: 'Opus plan / Sonnet execute',
        description: 'Uses Opus while planning and Sonnet while executing.',
        defaultEffort: 'xhigh',
        efforts: CLAUDE_OPUS,
      },
    ],
  },
  codex: {
    label: 'OpenAI Codex',
    defaultModel: 'gpt-5.6-sol',
    models: [
      {
        id: 'gpt-5.6-sol',
        label: 'GPT-5.6 Sol',
        description: 'Detail and polish for complex, open-ended work.',
        defaultEffort: 'medium',
        efforts: CODEX_ULTRA,
      },
      {
        id: 'gpt-5.6-terra',
        label: 'GPT-5.6 Terra',
        description: 'Pragmatic all-rounder for everyday engineering work.',
        defaultEffort: 'medium',
        efforts: CODEX_ULTRA,
      },
      {
        id: 'gpt-5.6-luna',
        label: 'GPT-5.6 Luna',
        description: 'Clear, repeatable, high-volume tasks.',
        defaultEffort: 'medium',
        efforts: CODEX_MAX,
      },
      {
        id: 'gpt-5.5',
        label: 'GPT-5.5',
        description: 'Previous-generation general Codex model.',
        defaultEffort: 'medium',
        efforts: CODEX_STANDARD,
      },
      {
        id: 'gpt-5.4',
        label: 'GPT-5.4',
        description: 'Compatibility option for workflows pinned to GPT-5.4.',
        defaultEffort: 'medium',
        efforts: CODEX_STANDARD,
      },
      {
        id: 'gpt-5.4-mini',
        label: 'GPT-5.4 Mini',
        description: 'Smaller model for lower-latency scoped tasks.',
        defaultEffort: 'medium',
        efforts: CODEX_STANDARD,
      },
    ],
  },
};

export function isProviderSelectionSupported(
  provider: string,
  model: string,
  effort: string,
): boolean {
  if (provider !== 'claude' && provider !== 'codex') return false;
  const option = PROVIDER_MODEL_CATALOG[provider].models.find((entry) => entry.id === model);
  return option?.efforts.includes(effort as ReasoningEffort) ?? false;
}
