import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { ReactNode } from 'react';

const ink = '#1a1510';
const paper = '#f5f0e8';
const cream = '#ebe2d2';
const muted = '#7f7568';
const accent = '#c84b2f';
const green = '#2d6a4f';
const blue = '#1a4a8a';
const purple = '#7b3fa0';
const gold = '#d4a843';

const ease = Easing.bezier(0.16, 1, 0.3, 1);

export const EngrambleDemo = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: paper, color: ink, fontFamily: 'Georgia, serif', overflow: 'hidden' }}>
      <BackgroundTexture />
      <Sequence from={0} durationInFrames={105} premountFor={30}>
        <IntroScene />
      </Sequence>
      <Sequence from={90} durationInFrames={120} premountFor={30}>
        <DailyScene />
      </Sequence>
      <Sequence from={195} durationInFrames={115} premountFor={30}>
        <CreateSetScene />
      </Sequence>
      <Sequence from={300} durationInFrames={125} premountFor={30}>
        <GameModesScene />
      </Sequence>
      <Sequence from={410} durationInFrames={115} premountFor={30}>
        <GrowthScene />
      </Sequence>
      <Sequence from={510} durationInFrames={90} premountFor={30}>
        <FinalScene />
      </Sequence>
    </AbsoluteFill>
  );
};

const BackgroundTexture = () => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 600], [0, -80], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `linear-gradient(rgba(26,21,16,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(26,21,16,0.045) 1px, transparent 1px)`,
          backgroundSize: '72px 72px',
          transform: `translateY(${drift}px)`,
        }}
      />
      <FloatingShape color={accent} left={780} top={90} size={190} delay={0} />
      <FloatingShape color={green} left={80} top={1480} size={130} delay={24} />
      <FloatingShape color={gold} left={820} top={1560} size={120} delay={42} />
    </AbsoluteFill>
  );
};

const FloatingShape = ({ color, left, top, size, delay }: { color: string; left: number; top: number; size: number; delay: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pulse = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 18, stiffness: 80 } });

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: size,
        height: size,
        borderRadius: 24,
        border: `4px solid ${ink}`,
        background: color,
        opacity: 0.11,
        transform: `rotate(${pulse * 10}deg) scale(${0.85 + pulse * 0.15})`,
      }}
    />
  );
};

const SceneShell = ({ kicker, title, subtitle, children }: { kicker: string; title: string; subtitle: string; children: ReactNode }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 20, stiffness: 90 } });
  const y = interpolate(enter, [0, 1], [70, 0]);

  return (
    <AbsoluteFill style={{ padding: '120px 88px', opacity: enter, transform: `translateY(${y}px)` }}>
      <div style={{ fontFamily: 'monospace', color: muted, fontSize: 28, letterSpacing: 8, textTransform: 'uppercase' }}>{kicker}</div>
      <h1 style={{ margin: '24px 0 12px', fontSize: 90, lineHeight: 0.95, letterSpacing: 0 }}>{title}</h1>
      <p style={{ margin: 0, color: muted, fontFamily: 'monospace', fontSize: 30, lineHeight: 1.45 }}>{subtitle}</p>
      {children}
    </AbsoluteFill>
  );
};

const IntroScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 16, stiffness: 70 } });
  const word = interpolate(frame, [20, 52], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const tagline = interpolate(frame, [44, 78], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Img
        src={staticFile('engramble-logo-final.png')}
        style={{
          width: 360,
          height: 360,
          objectFit: 'contain',
          transform: `scale(${0.72 + logo * 0.28}) rotate(${interpolate(logo, [0, 1], [-8, 0])}deg)`,
        }}
      />
      <div style={{ marginTop: 18, fontSize: 112, fontWeight: 900, opacity: word, transform: `translateY(${(1 - word) * 34}px)` }}>
        Engram<span style={{ color: accent }}>ble</span>
      </div>
      <div style={{ marginTop: 16, fontFamily: 'monospace', fontSize: 34, color: ink, opacity: tagline }}>
        Study smarter, one game at a time.
      </div>
    </AbsoluteFill>
  );
};

const DailyScene = () => {
  return (
    <SceneShell kicker="Daily Challenge" title="Four games. One warm-up." subtitle="Turn your own sets into quick review rounds.">
      <PhoneMockup top={430}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 48, fontWeight: 900 }}>Daily Challenge</div>
        <div style={{ marginTop: 8, fontFamily: 'monospace', color: muted, fontSize: 18 }}>Four games. One shot. Every day.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 34 }}>
          <ModeTile icon="connections_icon.svg" title="Classify" delay={0} />
          <ModeTile icon="reveal_icon.svg" title="Reveal" delay={8} />
          <ModeTile icon="blackout_logo.svg" title="Blackout" delay={16} />
          <ModeTile icon="arrange_icon.svg" title="Arrange" delay={24} />
        </div>
      </PhoneMockup>
    </SceneShell>
  );
};

const CreateSetScene = () => {
  const frame = useCurrentFrame();
  const terms = ['Neuron - carries signals', 'Synapse - gap between cells', 'Axon - sends impulses', 'Dendrite - receives signals'];
  const typedCount = Math.min(terms.length, Math.floor(frame / 18) + 1);

  return (
    <SceneShell kicker="Build Sets Fast" title="Paste notes. Play instantly." subtitle="Bulk text becomes terms, definitions, and game-ready categories.">
      <div style={{ position: 'absolute', left: 88, right: 88, top: 650, border: `5px solid ${ink}`, borderRadius: 12, background: ink, padding: 28 }}>
        <div style={{ fontFamily: 'monospace', color: paper, fontSize: 30, lineHeight: 1.75 }}>
          {terms.slice(0, typedCount).map((term) => (
            <div key={term}>{term}</div>
          ))}
          <span style={{ color: accent }}>_</span>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 138, right: 138, top: 1040, display: 'grid', gap: 16 }}>
        {['Auto-split terms', 'Save to My Sets', 'Launch any game'].map((item, index) => (
          <CheckRow key={item} text={item} delay={index * 18 + 50} />
        ))}
      </div>
    </SceneShell>
  );
};

const GameModesScene = () => {
  return (
    <SceneShell kicker="Game Modes" title="Different recall muscles." subtitle="Classify categories, reveal clues, fill blanks, and order sequences.">
      <div style={{ position: 'absolute', left: 68, right: 68, bottom: 150, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
        <GameFeature icon="connections_icon.svg" title="Classify" copy="Sort 4 related terms before mistakes run out." delay={0} />
        <GameFeature icon="reveal_icon.svg" title="Reveal" copy="Guess earlier for bigger points." delay={12} />
        <GameFeature icon="blackout_logo.svg" title="Blackout" copy="Fill missing vocabulary from context." delay={24} />
        <GameFeature icon="arrange_icon.svg" title="Arrange" copy="Drag terms into the right order." delay={36} />
      </div>
    </SceneShell>
  );
};

const GrowthScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bars = [0.72, 0.48, 0.9, 0.62].map((value, index) =>
    interpolate(spring({ frame: frame - index * 8, fps, config: { damping: 18, stiffness: 80 } }), [0, 1], [0.08, value], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );

  return (
    <SceneShell kicker="Premium Tools" title="Tune the practice loop." subtitle="Pick set focus, adjust game length, and review weak spots.">
      <div style={{ position: 'absolute', left: 88, right: 88, top: 600, display: 'grid', gap: 22 }}>
        <SettingsCard label="Classify groups" value="4-6" />
        <SettingsCard label="Reveal rounds" value="3-10" />
        <SettingsCard label="Blackout blanks" value="1-3" />
        <SettingsCard label="Arrange terms" value="3-10" />
      </div>
      <div style={{ position: 'absolute', left: 88, right: 88, bottom: 145, border: `5px solid ${ink}`, borderRadius: 12, padding: 28, background: cream }}>
        <div style={{ fontFamily: 'monospace', color: muted, fontSize: 22, letterSpacing: 5, textTransform: 'uppercase' }}>Weekly Snapshot</div>
        <div style={{ display: 'flex', alignItems: 'end', gap: 18, height: 170, marginTop: 24 }}>
          {bars.map((bar, index) => (
            <div key={index} style={{ flex: 1, height: `${bar * 100}%`, background: [green, accent, blue, gold][index], border: `4px solid ${ink}`, borderRadius: 10 }} />
          ))}
        </div>
      </div>
    </SceneShell>
  );
};

const FinalScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 14, stiffness: 80 } });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: 80, textAlign: 'center' }}>
      <div style={{ transform: `scale(${0.82 + scale * 0.18})` }}>
        <Img src={staticFile('engramble-logo-final.png')} style={{ width: 260, height: 260, objectFit: 'contain', margin: '0 auto 18px' }} />
        <h1 style={{ fontSize: 104, lineHeight: 0.95, margin: 0 }}>Engram<span style={{ color: accent }}>ble</span></h1>
        <p style={{ margin: '28px 0 0', fontFamily: 'monospace', color: muted, fontSize: 34, lineHeight: 1.45 }}>
          Make review feel like a daily win.
        </p>
        <div style={{ margin: '58px auto 0', width: 520, border: `5px solid ${ink}`, borderRadius: 12, padding: '26px 34px', background: ink, color: paper, fontFamily: 'monospace', fontSize: 32, letterSpacing: 3, textTransform: 'uppercase' }}>
          engramble.app
        </div>
      </div>
    </AbsoluteFill>
  );
};

const PhoneMockup = ({ top, children }: { top: number; children: ReactNode }) => {
  return (
    <div
      style={{
        position: 'absolute',
        left: 142,
        right: 142,
        top,
        border: `6px solid ${ink}`,
        borderRadius: 28,
        padding: 34,
        background: paper,
        boxShadow: `18px 18px 0 ${ink}`,
      }}
    >
      {children}
    </div>
  );
};

const ModeTile = ({ icon, title, delay }: { icon: string; title: string; delay: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 90 } });

  return (
    <div style={{ border: `4px solid ${ink}`, borderRadius: 10, padding: 22, textAlign: 'center', transform: `translateY(${(1 - enter) * 34}px)`, opacity: enter }}>
      <Img src={staticFile(icon)} style={{ width: 76, height: 76, objectFit: 'contain', margin: '0 auto 12px' }} />
      <div style={{ fontSize: 28, fontWeight: 900 }}>{title}</div>
    </div>
  );
};

const CheckRow = ({ text, delay }: { text: string; delay: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 90 } });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, opacity: enter, transform: `translateX(${(1 - enter) * -44}px)` }}>
      <div style={{ width: 42, height: 42, border: `4px solid ${ink}`, borderRadius: 8, background: green }} />
      <div style={{ fontSize: 34, fontWeight: 900 }}>{text}</div>
    </div>
  );
};

const GameFeature = ({ icon, title, copy, delay }: { icon: string; title: string; copy: string; delay: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 90 } });

  return (
    <div
      style={{
        border: `5px solid ${ink}`,
        borderRadius: 12,
        padding: 28,
        minHeight: 250,
        background: paper,
        opacity: enter,
        transform: `scale(${0.88 + enter * 0.12}) rotate(${(1 - enter) * -4}deg)`,
      }}
    >
      <Img src={staticFile(icon)} style={{ width: 86, height: 86, objectFit: 'contain' }} />
      <div style={{ marginTop: 18, fontSize: 38, fontWeight: 900 }}>{title}</div>
      <p style={{ margin: '10px 0 0', fontFamily: 'monospace', color: muted, fontSize: 22, lineHeight: 1.35 }}>{copy}</p>
    </div>
  );
};

const SettingsCard = ({ label, value }: { label: string; value: string }) => {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `4px solid ${ink}`, borderRadius: 12, padding: '24px 28px', background: paper }}>
      <span style={{ fontSize: 32, fontWeight: 900 }}>{label}</span>
      <span style={{ minWidth: 120, textAlign: 'center', border: `4px solid ${ink}`, borderRadius: 10, padding: '14px 18px', fontFamily: 'monospace', fontSize: 28 }}>{value}</span>
    </div>
  );
};
