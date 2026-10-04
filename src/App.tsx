import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { TabBar, type Tab } from './components/TabBar';
import { RestBar, type RestState } from './components/RestBar';
import { Celebration } from './components/Celebration';
import { SwapSheet } from './components/SwapSheet';
import type { CardioTimer } from './components/CardioCard';
import { ConfirmDialog } from './components/ConfirmDialog';
import { TodayScreen } from './screens/TodayScreen';
import { WorkoutScreen, type CardioRole } from './screens/WorkoutScreen';
import { SummaryScreen } from './screens/SummaryScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { useUi } from './ui/adapter';
import type { Metric, SummaryVM } from './ui/types';
import './ui/styles/app.css';

const NO_TIMER: CardioTimer = { endsAt: null, pausedLeftSec: null };
const NO_TIMERS: Record<CardioRole, CardioTimer> = { warmup: NO_TIMER, finisher: NO_TIMER };

export default function App() {
  const ui = useUi();
  const [tab, setTab] = useState<Tab>('today');
  const [rest, setRest] = useState<RestState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [prFlash, setPrFlash] = useState<{ exIdx: number; setIdx: number } | null>(null);
  const [swapIdx, setSwapIdx] = useState<number | null>(null);
  const [summary, setSummary] = useState<SummaryVM | null>(null);
  const [timers, setTimers] = useState<Record<CardioRole, CardioTimer>>(NO_TIMERS);
  const [confirmFinish, setConfirmFinish] = useState<number | null>(null);
  const [metric, setMetric] = useState<Metric>('e1rm');
  const [selectedEx, setSelectedEx] = useState<string | null>(null);

  const { active, settings } = ui;
  const unit = settings.unit;

  // Progress: default to first exercise with history.
  useEffect(() => {
    if (!selectedEx && ui.loggedExercises.length) setSelectedEx(ui.loggedExercises[0].id);
  }, [selectedEx, ui.loggedExercises]);
  const series = useMemo(() => (selectedEx ? ui.getSeries(selectedEx) : []), [selectedEx, ui]);

  const clearToast = useCallback(() => setToast(null), []);
  const restFinished = useCallback(() => { /* bar turns green; user dismisses */ }, []);

  const toggleDone = async (exIdx: number, setIdx: number) => {
    if (!active) return;
    const ex = active.exercises[exIdx];
    const set = ex.sets[setIdx];
    const nowDone = !set.done;
    const prs = await ui.setDone(ex.slotId, setIdx, nowDone, { weight: set.weight, reps: set.reps });
    if (nowDone) {
      const sec = ex.restSec ?? settings.restSec;
      setRest({ endsAt: Date.now() + sec * 1000, total: sec });
      if (prs.length) {
        setPrFlash({ exIdx, setIdx });
        setToast(`🏆 New PR · ${prs[0].kinds.join(' + ')}\n${prs[0].name}: ${prs[0].text}`);
        setTimeout(() => setPrFlash(null), 2400);
      }
    }
  };

  const requestFinish = () => {
    if (!active) return;
    const open = active.exercises.reduce((n, e) => n + e.sets.filter((x) => !x.done).length, 0);
    if (open > 0) setConfirmFinish(open); else void finish();
  };
  const finish = async () => {
    setConfirmFinish(null);
    setRest(null);
    setTimers(NO_TIMERS);
    const s = await ui.finish();
    setSummary(s);
  };

  const inWorkout = !!active && !summary;
  const swapEx = swapIdx != null && active ? active.exercises[swapIdx] : null;
  const showRest = !!rest && inWorkout && tab === 'today';

  let screen;
  if (tab === 'progress') {
    screen = (
      <ProgressScreen unit={unit} history={ui.history} exercises={ui.loggedExercises} selectedId={selectedEx} series={series}
        metric={metric} onSelect={setSelectedEx} onMetric={setMetric} cardioMinutes={ui.cardioMinutes}
        bodyweight={ui.bodyweight} onLogBodyweight={ui.logBodyweight} />
    );
  } else if (tab === 'settings') {
    screen = <SettingsScreen settings={settings} onChange={ui.updateSettings} onExport={ui.exportFile} onImport={ui.importText} />;
  } else if (summary) {
    screen = <SummaryScreen summary={summary} unit={unit} onDone={() => setSummary(null)} />;
  } else if (active) {
    screen = (
      <WorkoutScreen
        dayName={active.dayName} unit={unit} startedAt={active.startedAt} exercises={active.exercises}
        cardio={active.cardio} finisher={active.finisher} finisherOffer={active.finisherOffer} timers={timers}
        prFlash={prFlash}
        onCardioTimer={(role, t) => setTimers((m) => ({ ...m, [role]: t }))}
        onCardioChange={(role, patch) => ui.updateCardio(role, patch)}
        onCardioDone={(role) => { const c = role === 'warmup' ? active.cardio : active.finisher; ui.updateCardio(role, { done: !c?.done }, c); }}
        onAddFinisher={ui.addFinisher}
        onRemoveFinisher={() => { setTimers((m) => ({ ...m, finisher: NO_TIMER })); ui.removeFinisher(); }}
        onSetChange={(e, s, patch) => ui.updateSet(active.exercises[e].slotId, s, patch)}
        onToggleDone={toggleDone}
        onAddSet={(e) => ui.addSet(active.exercises[e].slotId)}
        onSwap={setSwapIdx}
        onFinish={requestFinish}
      />
    );
  } else {
    screen = <TodayScreen today={ui.today} unit={unit} bodyweightToday={ui.bodyweight.today} onStart={() => ui.start()}
      onLogBodyweight={() => { setTab('progress'); window.scrollTo(0, 0); }} />;
  }

  return (
    <div className="app" style={showRest ? ({ '--rest-pad': 'var(--restbar-h)' } as CSSProperties) : undefined}>
      {ui.error && <div className="card" role="alert" style={{ margin: 12, borderColor: 'var(--danger)' }}>{ui.error}</div>}
      {screen}
      {showRest && rest && (
        <RestBar rest={rest} onAdd={(s) => setRest((r) => (r ? { endsAt: Math.max(r.endsAt, Date.now()) + s * 1000, total: r.total + s } : r))}
          onSkip={() => setRest(null)} onFinished={restFinished} />
      )}
      <TabBar tab={tab} onChange={setTab} />
      {swapEx && (
        <SwapSheet open currentName={swapEx.name} options={ui.getSwaps(swapEx.slotId)}
          defaultSets={swapEx.targetSets} defaultReps={swapEx.targetReps}
          onClose={() => setSwapIdx(null)}
          onSwap={async (id, scope) => { await ui.swap(swapEx.slotId, id, scope); setSwapIdx(null); }}
          onAddCustom={async (input, scope) => { await ui.addCustom(swapEx.slotId, input, scope); setSwapIdx(null); }} />
      )}
      {toast && <Celebration message={toast} onDone={clearToast} />}
      {confirmFinish != null && (
        <ConfirmDialog title="Finish workout?" body={`${confirmFinish} set${confirmFinish === 1 ? '' : 's'} not marked done. Only completed sets are saved to history.`}
          confirmLabel="Finish" onCancel={() => setConfirmFinish(null)} onConfirm={() => void finish()} />
      )}
    </div>
  );
}
