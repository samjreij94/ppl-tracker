import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Stepper } from '../components/Stepper';
import { EXPERIENCE_INFO, GOAL_INFO, plural, type DeloadVM, type Experience, type GoalKind, type ProfileVM, type SettingsVM } from '../ui/types';

interface Props {
  settings: SettingsVM;
  onChange: (patch: Partial<SettingsVM>) => void;
  onExport: () => Promise<string | void>;
  onImport: (text: string) => Promise<void>;
  deload?: DeloadVM;
  onEndDeload?: () => void;
  profile?: ProfileVM;
  /** False until core stores name/experience (TODO(core)); those fields are then read-only. */
  profileSupported?: boolean;
  onProfileChange?: (patch: Partial<{ name: string; goal: GoalKind; experience: Experience }>) => void;
}

export function SettingsScreen({ settings, onChange, onExport, onImport, deload, onEndDeload, profile, profileSupported = true, onProfileChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ name: string; text: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [nameDraft, setNameDraft] = useState(profile?.name ?? '');
  useEffect(() => setNameDraft(profile?.name ?? ''), [profile?.name]);
  const commitName = () => {
    const n = nameDraft.trim();
    if (n && n !== profile?.name) onProfileChange?.({ name: n });
    else setNameDraft(profile?.name ?? '');
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    try { JSON.parse(text); } catch { setMsg({ ok: false, text: 'That file is not valid JSON.' }); return; }
    setPending({ name: f.name, text });
  };

  return (
    <div className="screen" data-testid="settings">
      <header className="screen-header">
        <div className="eyebrow">Settings</div>
        <h1>Preferences</h1>
      </header>

      <h2 className="section" style={{ marginTop: 0 }}>Profile</h2>
      <div className="card" style={{ padding: '4px 16px' }} data-testid="settings-profile">
        {profile && (
          <>
            <label className="setting setting-col">
              <span className="k">Name</span>
              <input className="name-input" data-testid="profile-name" value={nameDraft} maxLength={30} autoComplete="given-name" autoCapitalize="words"
                enterKeyHint="done" disabled={!profileSupported} placeholder={profileSupported ? 'First name' : 'Available after the next update'}
                onChange={(e) => setNameDraft(e.target.value)} onBlur={commitName} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
            </label>
            <div className="setting setting-col">
              <div className="k">Goal</div>
              <div className="seg" role="group" aria-label="Goal">
                {(Object.keys(GOAL_INFO) as GoalKind[]).map((g) => (
                  <button key={g} aria-pressed={profile.goal === g} onClick={() => onProfileChange?.({ goal: g })}>{GOAL_INFO[g].short}</button>
                ))}
              </div>
              <div className="dim" style={{ fontSize: 13 }}>{GOAL_INFO[profile.goal].desc}</div>
            </div>
            <div className="setting setting-col">
              <div className="k">Experience</div>
              <div className="seg" role="group" aria-label="Experience">
                {(Object.keys(EXPERIENCE_INFO) as Experience[]).map((x) => (
                  <button key={x} aria-pressed={profile.experience === x} disabled={!profileSupported} onClick={() => onProfileChange?.({ experience: x })}>{EXPERIENCE_INFO[x].title}</button>
                ))}
              </div>
            </div>
          </>
        )}
        <div className="setting">
          <div className="k">Units</div>
          <div className="seg" role="group" aria-label="Units">
            <button aria-pressed={settings.unit === 'lb'} onClick={() => onChange({ unit: 'lb' })}>lb</button>
            <button aria-pressed={settings.unit === 'kg'} onClick={() => onChange({ unit: 'kg' })}>kg</button>
          </div>
        </div>
        <div className="setting">
          <div className="k">Training days<div className="dim" style={{ fontSize: 13, fontWeight: 400 }}>per week</div></div>
          <div className="seg" role="group" aria-label="Schedule">
            <button aria-pressed={settings.schedule === 3} onClick={() => onChange({ schedule: 3 })}>3 days</button>
            <button aria-pressed={settings.schedule === 6} onClick={() => onChange({ schedule: 6 })}>6 days</button>
          </div>
        </div>
      </div>

      <h2 className="section">Workout</h2>
      <div className="card" style={{ padding: '4px 16px' }}>
        <div className="setting">
          <div className="k">Default rest (sec)<div className="dim num" style={{ fontSize: 13, fontWeight: 400 }}>{Math.floor(settings.restSec / 60)}:{String(settings.restSec % 60).padStart(2, '0')} min</div></div>
          <div style={{ width: 170 }}>
            <Stepper label="Default rest seconds" value={settings.restSec} step={15} min={15} max={600} decimals={0} onChange={(v) => onChange({ restSec: v })} />
          </div>
        </div>
      </div>

      {deload?.active && (
        <>
          <h2 className="section">Training</h2>
          <div className="card" style={{ padding: '4px 16px' }} data-testid="settings-deload">
            <div className="setting">
              <div className="k">Deload week<div className="dim num" style={{ fontSize: 13, fontWeight: 400 }}>{deload.daysLeft != null ? `${plural(deload.daysLeft, 'day')} left` : 'in progress'}</div></div>
              <button className="btn btn-ghost" onClick={onEndDeload} data-testid="end-deload">End deload</button>
            </div>
          </div>
        </>
      )}

      <h2 className="section">Your data</h2>
      <div className="card settings-actions">
        <p className="dim" style={{ margin: '0 0 12px', fontSize: 15 }}>Everything is stored on this phone. Export a backup file regularly.</p>
        <button className="btn btn-primary" data-testid="export" onClick={async () => {
          try { const r = await onExport(); setMsg({ ok: true, text: r || 'Backup exported.' }); } catch (e) { setMsg({ ok: false, text: `Export failed: ${(e as Error).message}` }); }
        }}>Export backup (JSON)</button>
        <button className="btn" data-testid="import" onClick={() => fileRef.current?.click()}>Import backup…</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden data-testid="import-file" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        {msg && <div role="status" style={{ marginTop: 12, color: msg.ok ? 'var(--accent)' : 'var(--danger)', fontWeight: 600 }}>{msg.text}</div>}
      </div>
      <p className="dim" style={{ textAlign: 'center', fontSize: 13, marginTop: 24 }}>PPL Tracker · works offline</p>

      {pending && (
        <ConfirmDialog
          title="Replace all data?"
          body={<>Importing <b>{pending.name}</b> will overwrite your current workouts and settings on this device. This can’t be undone.</>}
          confirmLabel="Overwrite"
          danger
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            const p = pending; setPending(null);
            try { await onImport(p.text); setMsg({ ok: true, text: 'Backup imported.' }); } catch (e) { setMsg({ ok: false, text: `Import failed: ${(e as Error).message}` }); }
          }}
        />
      )}
    </div>
  );
}
