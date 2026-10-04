/**
 * Deload UI: Today shows a calm "due" card → confirm → active badge; Settings can end it.
 * Core prescriptions drive the warm-up/finisher text; the deload hint renders with its own style.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../../App';
import { CoreProvider, createCore, createMemoryStorage, getBundledSeed, type Core } from '../../core';
import { hintText } from '../adapter';

const DAY = 86_400_000;

/** A core whose only finished session was ~6 weeks ago (deload due), seeded through import. */
async function dueCore(): Promise<Core> {
  const seed = getBundledSeed();
  const c0 = createCore({ storage: createMemoryStorage(), seed });
  await c0.init();
  c0.startSession();
  const ei = c0.getState().active!.entries.findIndex((e) => e.kind === 'strength');
  c0.logSet(ei, 0, { weight: 135, reps: 8, done: true });
  c0.finishSession();
  const data = JSON.parse(c0.exportJSON());
  const shift = (iso?: string) => (iso ? new Date(Date.parse(iso) - 42 * DAY).toISOString() : iso);
  for (const s of data.sessions) { s.startedAt = shift(s.startedAt); s.finishedAt = shift(s.finishedAt); }
  const core = createCore({ storage: createMemoryStorage(), seed });
  await core.init();
  const r = await core.importJSON(data);
  expect(r.ok).toBe(true);
  return core;
}

describe('deload UI', () => {
  it('due card → confirm → active badge → End deload in Settings', async () => {
    const core = await dueCore();
    render(<CoreProvider core={core}><App /></CoreProvider>);
    const card = await screen.findByTestId('deload-card');
    expect(card).toHaveTextContent(/weeks since/i);
    expect(screen.queryByTestId('deload-badge')).toBeNull();

    fireEvent.click(within(card).getByTestId('start-deload'));
    const dlg = screen.getByRole('alertdialog', { name: /deload/i });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Start deload' }));

    await waitFor(() => expect(screen.getByTestId('deload-badge')).toHaveTextContent(/Deload week · \d+ days? left/));
    expect(screen.queryByTestId('deload-card')).toBeNull();
    expect(core.getState().settings.deload.active).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    fireEvent.click(await screen.findByTestId('end-deload'));
    expect(core.getState().settings.deload.active).toBe(false);
    expect(screen.queryByTestId('settings-deload')).toBeNull();
  });

  it('uses core prescriptions for warm-up and finisher text', async () => {
    const core = createCore({ storage: createMemoryStorage(), seed: getBundledSeed() });
    await core.init();
    core.completeOnboarding({ name: 'T', goal: 'fat-loss', experience: 'beginner', unit: 'lb', schedule: 6 });
    render(<CoreProvider core={core}><App /></CoreProvider>);
    const fin = await screen.findByTestId('today-finisher-rx');
    expect(fin.textContent).toMatch(/zone 2/i);
    expect(fin.textContent).toMatch(/^\d+ min /);
  });

  it('renders the deload hint message', () => {
    expect(hintText({ action: 'deload', message: 'deload week: 2 × 5 at 120 lb, stop at RIR 3-4', newWeight: 120, newSets: 2, targetReps: 5 } as never, 'lb'))
      .toBe('Deload week: 2 × 5 at 120 lb, stop at RIR 3-4');
  });
});
