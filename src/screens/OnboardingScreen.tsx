import { useState, type ReactNode } from 'react';
import { Stepper } from '../components/Stepper';
import { EXPERIENCE_INFO, GOAL_INFO, type Experience, type GoalKind, type OnboardingInput, type Schedule, type Unit } from '../ui/types';

interface Props {
  /** Prefill (current settings; existing profile when re-running). */
  initial: { name?: string; goal?: GoalKind; experience?: Experience | null; unit: Unit; schedule: Schedule };
  /** Persist everything and leave onboarding (called from the final "You're set" screen). */
  onComplete: (input: OnboardingInput) => void;
}

const STEPS = ['name', 'goal', 'experience', 'units', 'bodyweight'] as const;
type Step = (typeof STEPS)[number] | 'done';

/** First-run setup: 5 quick full-screen steps, then "You're set". One profile per device. */
export function OnboardingScreen({ initial, onComplete }: Props) {
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState(initial.name ?? '');
  const [goal, setGoal] = useState<GoalKind | null>(initial.goal ?? null);
  const [experience, setExperience] = useState<Experience | null>(initial.experience ?? null);
  const [unit, setUnit] = useState<Unit>(initial.unit);
  const [schedule, setSchedule] = useState<Schedule>(initial.schedule);
  const [bw, setBw] = useState<number | null>(null);
  const [bwDraft, setBwDraft] = useState<number>(initial.unit === 'kg' ? 80 : 180);

  const idx = step === 'done' ? STEPS.length : STEPS.indexOf(step);
  const go = (d: 1 | -1) => setStep(d === 1 ? (STEPS[idx + 1] ?? 'done') : STEPS[Math.max(0, idx - 1)]);
  const trimmed = name.trim();
  const finish = () => onComplete({ name: trimmed, goal: goal!, experience: experience!, unit, schedule, ...(bw != null && { bodyweight: bw }) });

  let body: ReactNode;
  let primary: { label: string; disabled?: boolean; onClick: () => void } = { label: 'Continue', onClick: () => go(1) };
  let secondary: ReactNode = null;

  switch (step) {
    case 'name':
      primary = { label: 'Continue', disabled: !trimmed, onClick: () => go(1) };
      body = (
        <>
          <div className="eyebrow">Welcome to PPL</div>
          <h1>What should we call you?</h1>
          <p className="dim lead">Your workouts stay on this phone. Each person sets up their own.</p>
          <input className="onb-input" data-testid="onb-name" aria-label="Your name" placeholder="First name" value={name} maxLength={30}
            autoComplete="given-name" autoCapitalize="words" enterKeyHint="next" autoFocus
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && trimmed) go(1); }} />
        </>
      );
      break;
    case 'goal':
      primary = { label: 'Continue', disabled: !goal, onClick: () => go(1) };
      body = (
        <>
          <div className="eyebrow">Your goal</div>
          <h1>What are you training for?</h1>
          <div className="choice-list" role="radiogroup" aria-label="Goal">
            {(Object.keys(GOAL_INFO) as GoalKind[]).map((g) => (
              <button key={g} type="button" role="radio" aria-checked={goal === g} className="choice" data-testid={`onb-goal-${g}`} onClick={() => setGoal(g)}>
                <span className="choice-title">{GOAL_INFO[g].title}</span>
                <span className="choice-desc">{GOAL_INFO[g].desc}</span>
              </button>
            ))}
          </div>
        </>
      );
      break;
    case 'experience':
      primary = { label: 'Continue', disabled: !experience, onClick: () => go(1) };
      body = (
        <>
          <div className="eyebrow">Experience</div>
          <h1>How long have you been lifting?</h1>
          <div className="choice-list" role="radiogroup" aria-label="Experience">
            {(Object.keys(EXPERIENCE_INFO) as Experience[]).map((x) => (
              <button key={x} type="button" role="radio" aria-checked={experience === x} className="choice" data-testid={`onb-exp-${x}`} onClick={() => setExperience(x)}>
                <span className="choice-title">{EXPERIENCE_INFO[x].title}</span>
                <span className="choice-desc">{EXPERIENCE_INFO[x].desc}</span>
              </button>
            ))}
          </div>
        </>
      );
      break;
    case 'units':
      body = (
        <>
          <div className="eyebrow">Setup</div>
          <h1>Units and schedule</h1>
          <div className="onb-field">
            <div className="lbl">Weight units</div>
            <div className="seg seg-lg" role="group" aria-label="Units">
              <button aria-pressed={unit === 'lb'} onClick={() => { setUnit('lb'); if (bw == null) setBwDraft(180); }}>lb</button>
              <button aria-pressed={unit === 'kg'} onClick={() => { setUnit('kg'); if (bw == null) setBwDraft(80); }}>kg</button>
            </div>
          </div>
          <div className="onb-field">
            <div className="lbl">Training days per week</div>
            <div className="seg seg-lg" role="group" aria-label="Schedule">
              <button aria-pressed={schedule === 3} onClick={() => setSchedule(3)}>3 days</button>
              <button aria-pressed={schedule === 6} onClick={() => setSchedule(6)}>6 days</button>
            </div>
            <p className="dim hint-line">{schedule === 6 ? 'Push, Pull, Legs twice a week.' : 'Push, Pull, Legs once a week; the rotation continues next week.'}</p>
          </div>
        </>
      );
      break;
    case 'bodyweight':
      primary = { label: 'Save and continue', onClick: () => { setBw(bwDraft); go(1); } };
      secondary = <button type="button" className="btn btn-ghost onb-skip" data-testid="onb-skip" onClick={() => { setBw(null); go(1); }}>Skip for now</button>;
      body = (
        <>
          <div className="eyebrow">Optional</div>
          <h1>Starting bodyweight</h1>
          <p className="dim lead">{goal === 'fat-loss' ? 'Log it a few mornings a week; the app tracks your 7-day trend against a 0.5–1%/week loss target.' : 'Handy for tracking your trend over time. You can log it later from Progress.'}</p>
          <div className="onb-field">
            <div className="lbl">Bodyweight ({unit})</div>
            <Stepper label="Starting bodyweight" suffix={unit} value={bwDraft} step={unit === 'kg' ? 0.5 : 1} min={20} max={1000} onChange={setBwDraft} />
          </div>
        </>
      );
      break;
    case 'done':
      primary = { label: 'Go to Today', onClick: finish };
      body = (
        <div className="onb-done">
          <div className="onb-check" aria-hidden="true">✓</div>
          <h1>You’re set, {trimmed}</h1>
          <ul className="onb-summary num">
            <li><span>Goal</span><b>{goal ? GOAL_INFO[goal].title : '–'}</b></li>
            <li><span>Experience</span><b>{experience ? EXPERIENCE_INFO[experience].title : '–'}</b></li>
            <li><span>Schedule</span><b>{schedule} days / week · {unit}</b></li>
            <li><span>Bodyweight</span><b>{bw != null ? `${bw} ${unit}` : 'Skipped'}</b></li>
          </ul>
          <p className="dim lead">You can change any of this in Settings → Profile.</p>
        </div>
      );
      break;
  }

  return (
    <div className="onb" data-testid="onboarding" data-step={step}>
      <div className="onb-top">
        <button type="button" className="icon-btn onb-back" aria-label="Back" data-testid="onb-back" onClick={() => go(-1)}
          style={{ visibility: idx === 0 ? 'hidden' : 'visible' }} disabled={idx === 0}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <div className="onb-dots" role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={STEPS.length + 1} aria-valuenow={idx + 1}
          aria-valuetext={step === 'done' ? 'Done' : `Step ${idx + 1} of ${STEPS.length}`}>
          {[...STEPS, 'done'].map((s, i) => <span key={s} className={i === idx ? 'on' : i < idx ? 'past' : ''} />)}
        </div>
        <span className="onb-count num" aria-hidden="true">{step === 'done' ? '' : `${idx + 1}/${STEPS.length}`}</span>
      </div>
      <div className="onb-body" key={step}>{body}</div>
      <div className="onb-foot">
        {secondary}
        <button type="button" className="btn btn-primary btn-lg" data-testid="onb-next" disabled={primary.disabled} onClick={primary.onClick}>{primary.label}</button>
      </div>
    </div>
  );
}
