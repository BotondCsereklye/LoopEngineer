import { describe, expect, it } from 'vitest';
import {
  PROVIDER_MODEL_CATALOG,
  isProviderSelectionSupported,
} from '../../src/providers/catalog.js';

describe('provider model catalog', () => {
  it('exposes current provider-specific models and intelligence levels', () => {
    expect(PROVIDER_MODEL_CATALOG.codex.models.map((model) => model.id)).toEqual(
      expect.arrayContaining(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']),
    );
    expect(
      PROVIDER_MODEL_CATALOG.codex.models.find((model) => model.id === 'gpt-5.6-sol')?.efforts,
    ).toContain('ultra');
    expect(PROVIDER_MODEL_CATALOG.claude.models.map((model) => model.id)).toEqual(
      expect.arrayContaining(['default', 'best', 'opus', 'sonnet', 'haiku']),
    );
  });

  it('validates model and intelligence combinations per provider', () => {
    expect(isProviderSelectionSupported('codex', 'gpt-5.6-terra', 'medium')).toBe(true);
    expect(isProviderSelectionSupported('claude', 'opus', 'xhigh')).toBe(true);
    expect(isProviderSelectionSupported('claude', 'haiku', 'max')).toBe(false);
    expect(isProviderSelectionSupported('claude', 'gpt-5.6-sol', 'high')).toBe(false);
  });
});
