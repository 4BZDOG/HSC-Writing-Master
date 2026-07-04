import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import RuntimeKeyModal from '../../components/admin/RuntimeKeyModal';
import {
  getRuntimeKeyOverride,
  clearRuntimeKeys,
  setRuntimeKeys,
} from '../../services/runtimeKeys';

const showToast = vi.fn();

beforeEach(() => {
  clearRuntimeKeys();
  showToast.mockReset();
});
afterEach(() => cleanup());

describe('runtimeKeys store', () => {
  it('returns null override when nothing is set', () => {
    expect(getRuntimeKeyOverride()).toBeNull();
  });

  it('exposes only the non-empty keys as an override payload', () => {
    setRuntimeKeys({ gemini: 'g-key', anthropic: '' });
    expect(getRuntimeKeyOverride()).toEqual({ gemini: 'g-key' });
  });

  it('trims whitespace and drops blank keys', () => {
    setRuntimeKeys({ gemini: '  spaced  ', anthropic: '   ' });
    expect(getRuntimeKeyOverride()).toEqual({ gemini: 'spaced' });
  });

  it('clears back to null', () => {
    setRuntimeKeys({ gemini: 'g-key' });
    clearRuntimeKeys();
    expect(getRuntimeKeyOverride()).toBeNull();
  });
});

describe('RuntimeKeyModal', () => {
  it('saves a pasted Gemini key through the store', () => {
    render(<RuntimeKeyModal isOpen={true} onClose={vi.fn()} showToast={showToast} />);
    fireEvent.change(screen.getByLabelText('Gemini API key'), { target: { value: 'AIzaTEST' } });
    fireEvent.click(screen.getByRole('button', { name: /save keys/i }));

    expect(getRuntimeKeyOverride()).toEqual({ gemini: 'AIzaTEST' });
    expect(showToast).toHaveBeenCalledWith('Runtime keys saved for this browser tab.', 'success');
  });

  it('refuses to save when both fields are blank', () => {
    render(<RuntimeKeyModal isOpen={true} onClose={vi.fn()} showToast={showToast} />);
    fireEvent.click(screen.getByRole('button', { name: /save keys/i }));

    expect(getRuntimeKeyOverride()).toBeNull();
    expect(showToast).toHaveBeenCalledWith(
      expect.stringMatching(/enter at least one key/i),
      'error'
    );
  });

  it('keeps an existing key for a provider whose field is left blank', () => {
    setRuntimeKeys({ gemini: 'existing-gemini' });
    render(<RuntimeKeyModal isOpen={true} onClose={vi.fn()} showToast={showToast} />);
    // Only fill Anthropic; Gemini field stays blank → existing gemini preserved.
    fireEvent.change(screen.getByLabelText('Anthropic API key'), {
      target: { value: 'sk-ant-new' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save keys/i }));

    expect(getRuntimeKeyOverride()).toEqual({ gemini: 'existing-gemini', anthropic: 'sk-ant-new' });
  });

  it('saves an OpenRouter key and links out to openrouter.ai', () => {
    render(<RuntimeKeyModal isOpen={true} onClose={vi.fn()} showToast={showToast} />);
    const link = screen.getByRole('link', { name: /openrouter\.ai/i }) as HTMLAnchorElement;
    expect(link.href).toContain('openrouter.ai/keys');
    expect(link.target).toBe('_blank');

    fireEvent.change(screen.getByLabelText('OpenRouter API key'), {
      target: { value: 'sk-or-TEST' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save keys/i }));
    expect(getRuntimeKeyOverride()).toEqual({ openrouter: 'sk-or-TEST' });
  });

  it('clears keys from the footer button', () => {
    setRuntimeKeys({ gemini: 'to-be-cleared' });
    render(<RuntimeKeyModal isOpen={true} onClose={vi.fn()} showToast={showToast} />);
    fireEvent.click(screen.getByRole('button', { name: /^clear$/i }));

    expect(getRuntimeKeyOverride()).toBeNull();
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/cleared/i), 'info');
  });

  it('masks the currently-set key rather than showing it in full', () => {
    setRuntimeKeys({ gemini: 'AIzaSECRETVALUE1234' });
    render(<RuntimeKeyModal isOpen={true} onClose={vi.fn()} showToast={showToast} />);
    // Masked as first4…last4, full secret never rendered.
    expect(screen.getByText(/AIza…1234/)).toBeTruthy();
    expect(screen.queryByText(/SECRETVALUE/)).toBeNull();
  });

  it('does not render when closed', () => {
    render(<RuntimeKeyModal isOpen={false} onClose={vi.fn()} showToast={showToast} />);
    expect(screen.queryByText('Runtime AI Keys')).toBeNull();
  });
});
