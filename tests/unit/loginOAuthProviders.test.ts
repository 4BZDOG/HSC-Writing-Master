import { describe, it, expect } from 'vitest';

/**
 * Which SSO buttons the login page draws.
 *
 * The bug this covers: the three provider buttons rendered unconditionally
 * whenever Supabase was configured, but a provider only works once it is
 * enabled in the Supabase dashboard — and a new project has none enabled. So
 * the default deployment showed a student three buttons that each failed after
 * redirecting them away from the app.
 *
 * `VITE_OAUTH_PROVIDERS` decides what is drawn. Unset must keep the old
 * behaviour, so upgrading cannot remove a login method someone is using.
 */

import { resolveOAuthProviders } from '../../components/LoginPage';

const ids = (raw: string | undefined) => resolveOAuthProviders(raw).map((p) => p.id);

describe('resolveOAuthProviders', () => {
  it('shows all three when unset — an upgrade must not remove a login method', () => {
    expect(ids(undefined)).toEqual(['google', 'azure', 'github']);
  });

  it('treats an empty or whitespace-only value as unset, not as "none"', () => {
    // A hosting dashboard that stores an empty string for a variable someone
    // added and left blank must not silently delete every SSO button.
    expect(ids('')).toEqual(['google', 'azure', 'github']);
    expect(ids('   ')).toEqual(['google', 'azure', 'github']);
  });

  it('narrows to the listed providers — a DoE school wants Microsoft alone', () => {
    expect(ids('azure')).toEqual(['azure']);
  });

  it('hides the section entirely on "none"', () => {
    expect(ids('none')).toEqual([]);
    expect(ids('NONE')).toEqual([]);
  });

  it('tolerates spacing and casing, as a pasted env value has both', () => {
    expect(ids(' Azure , GitHub ')).toEqual(['azure', 'github']);
  });

  it('orders by the configured list, not the catalogue', () => {
    // The first button reads as the primary way in, so the deployment picks it.
    expect(ids('azure,google')).toEqual(['azure', 'google']);
    expect(ids('google,azure')).toEqual(['google', 'azure']);
  });

  it('drops unknown names instead of rendering a button that cannot work', () => {
    expect(ids('azure,facebook,')).toEqual(['azure']);
    expect(ids('nonsense')).toEqual([]);
  });

  it('keeps a label and an icon for every provider it returns', () => {
    for (const provider of resolveOAuthProviders(undefined)) {
      expect(provider.label).toBeTruthy();
      expect(provider.icon).toBeTypeOf('function');
    }
  });
});
