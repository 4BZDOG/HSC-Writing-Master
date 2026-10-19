import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SubTopicCreatorModal from '../../components/SubTopicCreatorModal';

/**
 * Adding a sub-topic makes no AI call unless the curator asks for one. The
 * checkbox was ticked by default, so a curator who only wanted a heading got
 * dot points invented for it, and a failed call left four retries against the
 * circuit breaker with nothing on screen.
 */

afterEach(cleanup);

describe('adding a sub-topic', () => {
  it('does not ask for AI dot points unless the box is ticked', () => {
    const onItemCreated = vi.fn();
    render(
      <SubTopicCreatorModal
        isOpen
        onClose={vi.fn()}
        onItemCreated={onItemCreated}
        existingNames={[]}
      />
    );
    expect(screen.getByRole('checkbox')).toHaveProperty('checked', false);

    fireEvent.change(screen.getByLabelText(/Sub-topic name/i), { target: { value: 'Heading' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add sub-topic' }));

    expect(onItemCreated).toHaveBeenCalledWith('Heading', { generateDotPoints: false });
  });

  it('asks for them when ticked', () => {
    const onItemCreated = vi.fn();
    render(
      <SubTopicCreatorModal
        isOpen
        onClose={vi.fn()}
        onItemCreated={onItemCreated}
        existingNames={[]}
      />
    );
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText(/Sub-topic name/i), { target: { value: 'Heading' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add sub-topic' }));

    expect(onItemCreated).toHaveBeenCalledWith('Heading', { generateDotPoints: true });
  });
});
