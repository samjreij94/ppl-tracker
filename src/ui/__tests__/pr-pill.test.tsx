/**
 * Live per-set PR pill: driven by core `SetLog.prKinds` on the active session (survives reload).
 * Summary PR list and history trophy count the same thing: distinct exercises in `sessionPRs`.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../../App';
import { CoreProvider, createCore, createMemoryStorage, getBundledSeed, sessionPRs, type Core } from '../../core';
import { plural, pluralWord } from '../types';

afterEach(() => cleanup());

/** History: one finished session (100 lb × 8 on the first exercise), then an active session of the same day. */
async function coreWithHistory(storage = createMemoryStorage()): Promise<Core> {
  const core = createCore({ storage, seed: getBundledSeed() });
  await core.init();
  core.completeOnboarding({ name: 'T', goal: 'build-muscle', experience: 'intermediate', unit: 'lb', schedule: 6 });
  const s0 = core.startSession();
  const ei = s0.entries.findIndex((e) => e.kind === 'strength');
  core.logSet(ei, 0, { weight: 100, reps: 8, done: true });
  expect(core.finishSession()).not.toBeNull();
  core.startSession(s0.dayId);
  return core;
}

describe('live per-set PR pill', () => {
  it('appears on the PR set, clears on undo, and matches the summary + history trophy', async () => {
    const core = await coreWithHistory();
    render(<CoreProvider core={core}><App /></CoreProvider>);
    const ex = (await screen.findAllByTestId('exercise'))[0];
    const row = () => within(ex).getAllByTestId('set-row')[0];
    expect(within(ex).queryByTestId('set-pr')).toBeNull();

    // 100 → 105 lb on set 1, mark done: a new heaviest set → the pill shows on set 1 only.
    const w = within(row()).getByRole('group', { name: 'Weight' }).querySelector('input')!;
    fireEvent.change(w, { target: { value: '105' } });
    fireEvent.blur(w);
    expect(row()).toHaveTextContent('105');
    fireEvent.click(within(ex).getByRole('button', { name: 'Mark set 1 done' }));
    await waitFor(() => expect(within(row()).getByTestId('set-pr')).toBeInTheDocument());
    expect(within(ex).getAllByTestId('set-pr')).toHaveLength(1);
    expect(within(row()).getByTestId('set-pr').getAttribute('title')).toMatch(/Heaviest set/);

    // Undo → pill gone; redo → back.
    fireEvent.click(within(ex).getByRole('button', { name: 'Undo set 1' }));
    await waitFor(() => expect(within(ex).queryByTestId('set-pr')).toBeNull());
    fireEvent.click(within(ex).getByRole('button', { name: 'Mark set 1 done' }));
    await waitFor(() => expect(within(row()).getByTestId('set-pr')).toBeInTheDocument());

    // A second done set at the same weight is not a new PR (vs earlier sets this session).
    fireEvent.click(within(ex).getByRole('button', { name: 'Mark set 2 done' }));
    await waitFor(() => expect(within(ex).getByRole('button', { name: 'Undo set 2' })).toBeInTheDocument());
    expect(within(ex).getAllByTestId('set-pr')).toHaveLength(1);

    // Finish (confirm the open sets) → summary PR list.
    fireEvent.click(screen.getByTestId('finish'));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Finish' }));
    const summary = await screen.findByTestId('summary');
    const finished = core.getState().sessions.at(-1)!;
    const distinct = new Set(sessionPRs(core.getState(), finished).map((p) => p.exerciseId)).size;
    expect(distinct).toBe(1);
    expect(within(summary).getAllByText(/Heaviest set|e1RM|Rep PR/)).toHaveLength(distinct);
    expect(within(summary).getByTestId('summary-pr-count')).toHaveTextContent(plural(distinct, 'exercise'));

    // History trophy shows the same count.
    fireEvent.click(within(summary).getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: /Progress/ }));
    const trophies = await screen.findAllByTestId('history-prs');
    expect(trophies).toHaveLength(1);
    expect(trophies[0]).toHaveTextContent(String(distinct));
    expect(trophies[0]).toHaveAttribute('aria-label', '1 PR');
  });

  it('survives re-creating the core from persisted active session', async () => {
    const storage = createMemoryStorage();
    const core = await coreWithHistory(storage);
    const ei = core.getState().active!.entries.findIndex((e) => e.kind === 'strength');
    core.logSet(ei, 0, { weight: 105, reps: 8, done: true });
    expect(core.getState().active!.entries[ei].kind === 'strength' &&
      (core.getState().active!.entries[ei] as { sets: { prKinds?: string[] }[] }).sets[0].prKinds?.length).toBeGreaterThan(0);

    const { unmount } = render(<CoreProvider core={core}><App /></CoreProvider>);
    const ex = (await screen.findAllByTestId('exercise'))[0];
    await waitFor(() => expect(within(ex).getByTestId('set-pr')).toBeInTheDocument());
    expect(within(ex).getByTestId('set-pr').getAttribute('title')).toMatch(/Heaviest set/);
    unmount();

    // Fresh core from the same storage (simulates mid-workout reload) — pill comes from set.prKinds.
    const core2 = createCore({ storage, seed: getBundledSeed() });
    await core2.init();
    render(<CoreProvider core={core2}><App /></CoreProvider>);
    const ex2 = (await screen.findAllByTestId('exercise'))[0];
    await waitFor(() => expect(within(ex2).getByTestId('set-pr')).toBeInTheDocument());
    expect(within(ex2).getAllByTestId('set-pr')).toHaveLength(1);
    expect(within(ex2).getByTestId('set-pr').getAttribute('title')).toMatch(/Heaviest set/);
  });
});

describe('plural', () => {
  it('uses the singular only for exactly 1', () => {
    expect(plural(1, 'minute')).toBe('1 minute');
    expect(plural(0, 'set')).toBe('0 sets');
    expect(plural(2, 'rep')).toBe('2 reps');
    expect(plural(1, 'PR')).toBe('1 PR');
    expect(plural(3, 'person', 'people')).toBe('3 people');
    expect(pluralWord(1, 'workout')).toBe('workout');
  });
});
