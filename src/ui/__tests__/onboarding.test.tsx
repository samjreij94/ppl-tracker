/**
 * First-run onboarding. Core's profile fields are requested from Dealer (settings.profile,
 * settings.onboardedAt, completeOnboarding). TODO(core): until they land, `withProfileCore` stubs
 * that requested shape on a real core (test-only) so the UI decision + flow are covered; a plain
 * current core must behave like an existing, onboarded install (no onboarding).
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);
window.scrollTo = vi.fn() as never; // jsdom: not implemented
import App from '../../App';
import { CoreProvider, createCore, createMemoryStorage, getBundledSeed, type Core, type Settings, type SettingsPatch, type Storage } from '../../core';
import { OnboardingScreen } from '../../screens/OnboardingScreen';

const wrap = (core: Core) => ({ children }: { children: ReactNode }) => <CoreProvider core={core}>{children}</CoreProvider>;

type Ext = { onboardedAt?: string | null; profile?: { name?: string; experience?: string } };
/** Test-only stand-in for Dealer's requested API: settings.profile/onboardedAt + completeOnboarding(). */
function withProfileCore(core: Core, fresh: boolean) {
  const patch = (p: object) => core.updateSettings(p as SettingsPatch);
  if (fresh && core.getState().status === 'ready') patch({ onboardedAt: null, profile: {} });
  return Object.assign(core, {
    completeOnboarding: (i: { name: string; goal: string; experience: string; unit: 'lb' | 'kg'; schedule: 3 | 6 }) =>
      patch({ onboardedAt: new Date().toISOString(), profile: { name: i.name, experience: i.experience }, unit: i.unit, schedule: i.schedule, goal: { type: i.goal } }),
    updateProfile: (p: { name?: string; experience?: string }) => patch({ profile: { ...(core.getState().settings as Ext).profile, ...p } }),
  });
}

async function readyCore(storage: Storage = createMemoryStorage()) {
  const core = createCore({ storage, seed: getBundledSeed() });
  await core.init();
  return core;
}

describe('onboarding', () => {
  it('fresh install shows onboarding (only after core is ready) and finishes into Today with the name', async () => {
    const core = withProfileCore(await readyCore(), true);
    // a slow-loading store: the loading screen shows first, never a flash of onboarding or Today
    render(<App />, { wrapper: wrap(core) });
    expect(await screen.findByTestId('onboarding')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull(); // no tab bar during setup
    const next = () => fireEvent.click(screen.getByTestId('onb-next'));

    expect(screen.getByTestId('onb-next')).toBeDisabled();
    fireEvent.change(screen.getByTestId('onb-name'), { target: { value: '  Karyn ' } });
    next();
    expect(screen.getByTestId('onb-next')).toBeDisabled();
    fireEvent.click(screen.getByTestId('onb-goal-build-muscle'));
    next();
    fireEvent.click(screen.getByTestId('onb-back')); // Back keeps the choice
    expect(screen.getByTestId('onb-goal-build-muscle')).toHaveAttribute('aria-checked', 'true');
    next();
    fireEvent.click(screen.getByTestId('onb-exp-intermediate'));
    next();
    fireEvent.click(within(screen.getByRole('group', { name: 'Units' })).getByRole('button', { name: 'kg' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Schedule' })).getByRole('button', { name: '3 days' }));
    next();
    fireEvent.click(screen.getByRole('button', { name: /Increase Starting bodyweight/ }));
    next(); // save 80.5 kg
    expect(screen.getByRole('heading', { name: 'You’re set, Karyn' })).toBeInTheDocument();
    next();

    expect(await screen.findByTestId('today')).toBeInTheDocument();
    expect(screen.getByTestId('greeting')).toHaveTextContent(/, Karyn$/);
    const st = core.getState().settings as Settings & Ext;
    expect(st).toMatchObject({ unit: 'kg', schedule: 3, goal: { type: 'build-muscle' }, profile: { name: 'Karyn', experience: 'intermediate' } });
    expect(st.onboardedAt).toBeTruthy();
    expect(core.getState().bodyweight[0]).toMatchObject({ weight: 80.5, unit: 'kg' });
    // non-fat-loss: neutral labels, no fat-loss finisher preview
    expect(screen.queryByTestId('today-finisher')).toBeNull();
  });

  it('onboarded install skips it (and never flashes it while loading)', async () => {
    // existing install written by the current core (no profile fields = migrated as onboarded)
    const mem = createMemoryStorage();
    const c1 = await readyCore(mem);
    c1.logBodyweight({ weight: 190 });
    await c1.flush();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const slow: Storage = { get: async (k) => { await gate; return mem.get(k); }, set: (k, v) => mem.set(k, v), del: (k) => mem.del(k) };
    const c2 = createCore({ storage: slow, seed: getBundledSeed() });
    void c2.init();
    render(<App />, { wrapper: wrap(c2) });
    expect(screen.getByTestId('loading')).toBeInTheDocument();
    expect(screen.queryByTestId('onboarding')).toBeNull();
    await act(async () => { release(); });
    expect(await screen.findByTestId('today')).toBeInTheDocument();
    expect(screen.queryByTestId('onboarding')).toBeNull();

    // with Dealer's fields: onboardedAt set → Today, greeting shows the stored name
    const c3 = withProfileCore(await readyCore(), false);
    c3.updateSettings({ onboardedAt: '2026-10-01T12:00:00.000Z', profile: { name: 'Samir', experience: 'advanced' } } as SettingsPatch);
    render(<App />, { wrapper: wrap(c3) });
    expect((await screen.findAllByTestId('greeting')).some((g) => /Samir$/.test(g.textContent ?? ''))).toBe(true);
  });

  it('Settings › Profile edits name, goal and experience; fat-loss labels only for fat loss', async () => {
    const core = withProfileCore(await readyCore(), false);
    core.updateSettings({ onboardedAt: '2026-10-01T12:00:00.000Z', profile: { name: 'Samir', experience: 'advanced' } } as SettingsPatch);
    render(<App />, { wrapper: wrap(core) });
    fireEvent.click(await screen.findByRole('button', { name: 'Progress' }));
    expect(screen.getByTestId('bodyweight')).toHaveTextContent('Fat-loss phase');
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const prof = screen.getByTestId('settings-profile');
    const name = within(prof).getByTestId('profile-name');
    fireEvent.change(name, { target: { value: 'Sam' } });
    fireEvent.blur(name);
    fireEvent.click(within(within(prof).getByRole('group', { name: 'Goal' })).getByRole('button', { name: 'Strength' }));
    fireEvent.click(within(within(prof).getByRole('group', { name: 'Experience' })).getByRole('button', { name: 'Intermediate' }));
    expect(core.getState().settings).toMatchObject({ goal: { type: 'general-strength' }, profile: { name: 'Sam', experience: 'intermediate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Progress' }));
    await waitFor(() => expect(screen.getByTestId('bodyweight')).toHaveTextContent('Strength'));
    expect(screen.getByTestId('bodyweight')).not.toHaveTextContent('Fat-loss phase');
  });

  it('bodyweight step can be skipped; name is required', () => {
    const done = vi.fn();
    render(<OnboardingScreen initial={{ unit: 'lb', schedule: 6 }} onComplete={done} />);
    const next = () => fireEvent.click(screen.getByTestId('onb-next'));
    fireEvent.change(screen.getByTestId('onb-name'), { target: { value: '   ' } });
    expect(screen.getByTestId('onb-next')).toBeDisabled();
    fireEvent.change(screen.getByTestId('onb-name'), { target: { value: 'Karyn' } });
    next(); fireEvent.click(screen.getByTestId('onb-goal-fat-loss')); next();
    fireEvent.click(screen.getByTestId('onb-exp-beginner')); next(); next();
    fireEvent.click(screen.getByTestId('onb-skip'));
    expect(screen.getByText('Skipped')).toBeInTheDocument();
    next();
    expect(done).toHaveBeenCalledWith({ name: 'Karyn', goal: 'fat-loss', experience: 'beginner', unit: 'lb', schedule: 6 });
  });
});
