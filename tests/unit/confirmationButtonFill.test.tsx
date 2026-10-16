import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import ConfirmationModal from '../../components/ConfirmationModal';

/**
 * The destructive confirm was written as `bg-gradient-danger`, a class no
 * stylesheet defines. The button had no fill, so its white label sat on the
 * white dialog and vanished in the light theme. These pin that each intent
 * names a real, solid fill, so the label is always painted on something.
 */
describe('ConfirmationModal confirm button fill', () => {
  const renderModal = (isDestructive: boolean) =>
    render(
      <ConfirmationModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Sure?"
        message="Really?"
        confirmButtonText="Go ahead"
        isDestructive={isDestructive}
      />
    );

  it('paints the destructive confirm in solid red, never the undefined gradient class', () => {
    renderModal(true);
    const button = screen.getByRole('button', { name: 'Go ahead' });
    expect(button.className).toContain('bg-red-600');
    expect(button.className).not.toContain('bg-gradient-danger');
  });

  it('paints the primary confirm in solid indigo, the app action colour', () => {
    renderModal(false);
    const button = screen.getByRole('button', { name: 'Go ahead' });
    expect(button.className).toContain('bg-indigo-600');
    expect(button.className).not.toContain('from-');
  });
});
