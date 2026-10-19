import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { WaveView, type SeaSurface } from './scene/WaveView';
import {
  BOATS,
  PLACEHOLDER_FIGURES,
  UNITY_SCALES,
  beamSea,
  boatById,
  calmSea,
  combineSea,
  elevationRange,
  headSea,
  landingSea,
  matchScales,
  referenceSea,
  simulateMetrics,
  wavesCapped,
  wrapDeg,
  type ComfortFigures,
  type WaveComponent,
  type WaveId,
} from './sim/model';

function kg(n: number) {
  return `${Math.round(n).toLocaleString('en-US')} kg`;
}

function metres(n: number, digits = 3) {
  return `${n.toFixed(digits)} m`;
}

function deg(n: number) {
  return `${Math.round(wrapDeg(n))}°`;
}

function seconds(n: number) {
  return `${n.toFixed(2)} s`;
}

function shortBoat(name: string) {
  return name.replace('BENETEAU ', '').replace('HALLBERG-RASSY ', 'HR ');
}

export function App() {
  const [boatId, setBoatId] = useState('first-40');
  const [waves, setWaves] = useState<WaveComponent[]>(landingSea);
  const [heading, setHeading] = useState(78);
  const [speed, setSpeed] = useState(6.8);
  const [active, setActive] = useState<WaveId>('primary');
  const [paused, setPaused] = useState(false);
  const [clean, setClean] = useState(false);
  const [readouts, setReadouts] = useState(true);
  const [rotate, setRotate] = useState(true);
  const [drive, setDrive] = useState(false);
  const [custom, setCustom] = useState<ComfortFigures>(PLACEHOLDER_FIGURES);
  const [surface, setSurface] = useState<SeaSurface>('wire');

  const boat = boatById(boatId);
  const selected = waves.find((w) => w.id === active) ?? waves[1];
  const summary = combineSea(waves);
  const range = elevationRange(waves);
  const capped = wavesCapped(waves);

  const motion = useMemo(() => {
    if (!drive) {
      return {
        scales: UNITY_SCALES,
        metrics: simulateMetrics(boat, waves, heading, speed),
      };
    }
    return matchScales(boat, waves, heading, speed, custom);
  }, [boat, waves, heading, speed, drive, custom]);
  const figures = 'metrics' in motion ? motion.metrics : motion.achieved;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPaused((v) => !v);
      } else if (e.key === 'c' || e.key === 'C') setClean((v) => !v);
      else if (e.key === 'h' || e.key === 'H') setReadouts((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function patchWave(patch: Partial<WaveComponent>) {
    setWaves((list) => list.map((w) => (w.id === active ? { ...w, ...patch } : w)));
  }

  function chooseBoat(id: string) {
    const next = boatById(id);
    setBoatId(id);
    setSpeed(next.cruiseKn);
  }

  const primary = waves.find((w) => w.id === 'primary') ?? waves[0];
  const ticks = legendTicks(range);

  return (
    <div className={clean ? 'app clean' : 'app'}>
      <WaveView
        boat={boat}
        waves={waves}
        heading={heading}
        speedKn={speed}
        scales={motion.scales}
        paused={paused}
        rotate={rotate}
        onUserInteract={() => setRotate(false)}
        range={range}
        surface={surface}
      />

      {readouts && surface !== 'water' && (
        <>
          <aside className="hud left">
            <Row k="VESSEL" v={boat.name} />
            <Row k="DISPLACEMENT" v={kg(boat.displacement)} />
            <Row k={boat.lengthLabel} v={metres(boat.lengthShown)} />
            <Row k="BEAM" v={metres(boat.beam)} />
            <Row k="DRAUGHT" v={metres(boat.draught)} />
            <div className="hud-gap" />
            <Row k="ROLL" v={`${figures.rollRmsDeg.toFixed(1)}° RMS`} />
            <Row k="VERTICAL ACCEL" v={`${figures.verticalAccelMs2.toFixed(2)} m/s²`} />
            <Row k="SLAMMING" v={`${Math.round(figures.slammingPerHour)} / hour`} />
            <p className="hud-note">{(figures.verticalAccelMs2 / 9.81).toFixed(2)} g RMS</p>
          </aside>

          <aside className="hud right">
            <Row k="COMBINED" v={`${metres(summary.height)}  ${deg(summary.direction)}  ${seconds(summary.period)}`} />
            {waves.map((w) => (
              <Row
                key={w.id}
                k={w.name}
                v={w.enabled ? `${metres(w.height)}  ${deg(w.direction)}  ${seconds(w.period)}` : 'off'}
                dim={!w.enabled}
              />
            ))}
          </aside>

          <div className="legend">
            <div className="legend-title">Position (Z) m</div>
            <div className="legend-bar" />
            <div className="legend-ticks">
              {ticks.map((t) => (
                <span key={t}>{t.toFixed(3)}m</span>
              ))}
            </div>
          </div>
        </>
      )}

      {clean ? (
        <button className="restore" onClick={() => setClean(false)}>
          Controls
        </button>
      ) : (
      <ControlsSheet
        boat={shortBoat(boat.name)}
        detail={`${figures.rollRmsDeg.toFixed(1)}° roll · ${figures.verticalAccelMs2.toFixed(2)} m/s² · ${Math.round(figures.slammingPerHour)}/h`}
      >
        <div className="pills">
          <span className="pill-label">Surface</span>
          {(
            [
              ['wire', 'Wireframe'],
              ['colour', 'Colour'],
              ['water', 'Water'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={surface === id ? 'on' : ''} onClick={() => setSurface(id)}>
              {label}
            </button>
          ))}
        </div>

        <div className="pills">
          {BOATS.map((b) => (
            <button key={b.id} className={b.id === boatId ? 'on' : ''} onClick={() => chooseBoat(b.id)}>
              {shortBoat(b.name)}
            </button>
          ))}
        </div>

        <div className="pills">
          {waves.map((w) => (
            <button key={w.id} className={w.id === active ? 'on' : ''} onClick={() => setActive(w.id)}>
              {w.name.replace(' SWELL', '').replace('WAVE', '')}
            </button>
          ))}
          <label className="check">
            <input
              type="checkbox"
              checked={selected.enabled}
              onChange={(e) => patchWave({ enabled: e.target.checked })}
            />
            On
          </label>
        </div>

        <div className="sliders">
          <Slider label="Height" min={0} max={6} step={0.01} value={selected.height} unit="m" onChange={(v) => patchWave({ height: v })} />
          <Slider label="Period" min={1} max={16} step={0.1} value={selected.period} unit="s" onChange={(v) => patchWave({ period: v })} />
          <Slider label="Direction" min={0} max={359} step={1} value={selected.direction} unit="°" onChange={(v) => patchWave({ direction: v })} />
          <Slider label="Heading" min={0} max={359} step={1} value={heading} unit="°" onChange={setHeading} />
          <Slider label="Speed" min={0} max={boat.maxKn} step={0.1} value={speed} unit="kn" onChange={setSpeed} />
        </div>

        <div className="row-actions">
          <button onClick={() => setWaves(referenceSea())}>Reference</button>
          <button onClick={() => setWaves(headSea(heading))}>Head sea</button>
          <button onClick={() => setWaves(beamSea(heading, boat.rollPeriod))}>Beam sea</button>
          <button onClick={() => setWaves(calmSea())}>Calm</button>
          <button onClick={() => setHeading(wrapDeg(primary.direction + 180))}>Bow into it</button>
          <button onClick={() => setHeading(wrapDeg(primary.direction + 90))}>Beam to it</button>
          <button className={paused ? 'on' : ''} onClick={() => setPaused((v) => !v)}>
            {paused ? 'Play' : 'Pause'}
          </button>
          <button className={rotate ? 'on' : ''} onClick={() => setRotate((v) => !v)}>
            Rotate
          </button>
          <button onClick={() => setClean(true)}>Clean frame</button>
          <button onClick={() => setReadouts((v) => !v)}>{readouts ? 'Hide readout' : 'Show readout'}</button>
        </div>

        <div className="figures">
          <label className="check drive">
            <input type="checkbox" checked={drive} onChange={(e) => setDrive(e.target.checked)} />
            Match hull to these figures
          </label>
          <Figure label="Roll RMS °" value={custom.rollRmsDeg} step={0.1} onChange={(v) => setCustom({ ...custom, rollRmsDeg: v })} />
          <Figure label="Vert. accel m/s²" value={custom.verticalAccelMs2} step={0.05} onChange={(v) => setCustom({ ...custom, verticalAccelMs2: v })} />
          <Figure label="Slams / hour" value={custom.slammingPerHour} step={1} onChange={(v) => setCustom({ ...custom, slammingPerHour: v })} />
        </div>
        <p className="footnote">
          Preview model. Roll, vertical acceleration and slamming update from this sea
          {drive ? ', scaled toward the figures above' : ''}. Placeholders until a route file is connected.
          {capped ? ' A short wave was eased so the crest does not break the view.' : ''} Space pauses, C hides this panel.
        </p>
      </ControlsSheet>
      )}
    </div>
  );
}

function ControlsSheet({ boat, detail, children }: { boat: string; detail: string; children: ReactNode }) {
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);
  const drag = useRef({
    pointer: -1,
    startY: 0,
    startHeight: 0,
    lastY: 0,
    lastT: 0,
    velocity: 0,
    moved: false,
  });

  useEffect(() => {
    const el = sheetRef.current;
    if (el) el.style.maxHeight = '';
  }, [phone]);

  function limits() {
    const el = sheetRef.current;
    const safe = el ? parseFloat(getComputedStyle(el).paddingBottom) || 0 : 0;
    const peek = 88 + safe;
    const body = el?.querySelector('.sheet-body')?.scrollHeight ?? 0;
    const content = 88 + body + safe;
    const expanded = Math.min(window.innerHeight * 0.86, 860, Math.max(peek + 1, content));
    return { peek, expanded };
  }

  function settle(nextOpen: boolean) {
    const el = sheetRef.current;
    if (!el) return;
    el.classList.remove('dragging');
    requestAnimationFrame(() => {
      el.style.maxHeight = '';
      el.classList.toggle('open', nextOpen);
      setOpen(nextOpen);
    });
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!phone || e.button !== 0) return;
    const el = sheetRef.current;
    if (!el) return;
    const now = performance.now();
    drag.current = {
      pointer: e.pointerId,
      startY: e.clientY,
      startHeight: el.offsetHeight,
      lastY: e.clientY,
      lastT: now,
      velocity: 0,
      moved: false,
    };
    el.classList.add('dragging');
    el.style.maxHeight = `${el.offsetHeight}px`;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (d.pointer !== e.pointerId) return;
    const el = sheetRef.current;
    if (!el) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > 5) d.moved = true;
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    d.velocity = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = now;
    const { peek, expanded } = limits();
    let next = d.startHeight - dy;
    if (next < peek) next = peek - (peek - next) * 0.28;
    if (next > expanded) next = expanded + (next - expanded) * 0.28;
    el.style.maxHeight = `${Math.max(48, next)}px`;
  }

  function finish(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (d.pointer !== e.pointerId) return;
    d.pointer = -1;
    const el = sheetRef.current;
    if (!el) return;
    if (!d.moved) {
      settle(!el.classList.contains('open'));
      return;
    }
    const { peek, expanded } = limits();
    const current = d.startHeight - (e.clientY - d.startY);
    const flungOpen = d.velocity < -0.4;
    const flungClosed = d.velocity > 0.4;
    const nextOpen = flungOpen || (!flungClosed && current > (peek + expanded) / 2);
    settle(nextOpen);
  }

  return (
    <>
      {phone && (
        <div
          className={open ? 'sheet-backdrop show' : 'sheet-backdrop'}
          onClick={() => {
            const el = sheetRef.current;
            el?.classList.remove('open');
            setOpen(false);
          }}
        />
      )}
      <section ref={sheetRef} className={phone ? `dock sheet${open ? ' open' : ''}` : 'dock'} aria-label="Controls">
        {phone && (
          <div
            className="sheet-head"
            role="button"
            tabIndex={0}
            aria-expanded={open}
            aria-controls="sea-controls"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finish}
            onPointerCancel={finish}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              setOpen((v) => !v);
            }}
          >
            <span className="grabber" />
            <span className="sheet-title">
              <strong>Controls</strong>
              <em>{boat}</em>
            </span>
            <span className="sheet-detail">{detail}</span>
            <Chevron open={open} />
          </div>
        )}
        <div className="sheet-body" id="sea-controls" inert={phone && !open ? true : undefined}>
          {children}
        </div>
      </section>
    </>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={open ? 'chev open' : 'chev'} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 6.2 8 10.4 13 6.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function usePhone() {
  const query = '(max-width: 900px)';
  const [phone, setPhone] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setPhone(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return phone;
}

function Row({ k, v, dim = false }: { k: string; v: string; dim?: boolean }) {
  return (
    <div className={dim ? 'spec dim' : 'spec'}>
      <span>{k}</span>
      <strong>{v}</strong>
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  unit,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="slider">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--p' as string]: `${((value - min) / (max - min)) * 100}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <em>
        {step < 1 ? value.toFixed(step < 0.1 ? 2 : 1) : Math.round(value)}
        {unit}
      </em>
    </label>
  );
}

function Figure({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="figure">
      <span>{label}</span>
      <input type="number" value={Number.isFinite(value) ? value : 0} step={step} min={0} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function legendTicks(range: number) {
  const step = range <= 2.5 ? 0.5 : 1;
  const ticks: number[] = [];
  for (let v = -range; v <= range + 1e-6; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}
