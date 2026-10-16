import React from 'react';
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
} from 'remotion';

const C = {
  paper: '#f7f5f0',
  white: '#fffefb',
  ink: '#2c2b27',
  muted: '#68665e',
  accent: '#a84426',
  line: '#d8d4cb',
};
const serif = 'Georgia, "Times New Roman", serif';
const sans = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const enter = (frame, delay = 0) =>
  spring({ frame: frame - delay, fps: 30, config: { damping: 25, stiffness: 120, mass: 1.1 } });

function Screen({ src, x = 660, y = 220, width = 1160, scale = 1, style = {} }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        aspectRatio: '1.6',
        overflow: 'hidden',
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        boxShadow: '0 24px 64px #2c2b271c',
        transform: `scale(${scale})`,
        transformOrigin: '50% 50%',
        ...style,
      }}
    >
      <Img
        src={staticFile('captures/' + src)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </div>
  );
}
function Phone({ x = 580, y = 235, width = 330, style = {} }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height: (width * 844) / 390,
        background: C.ink,
        border: `9px solid ${C.ink}`,
        borderRadius: 38,
        overflow: 'hidden',
        boxShadow: '0 22px 50px #2c2b2728',
        ...style,
      }}
    >
      <Img
        src={staticFile('captures/mobile.png')}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  );
}
function Footer({ chapter = 'A little, remembered.' }) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 88,
          right: 88,
          bottom: 68,
          height: 1,
          background: C.line,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 30,
          left: 88,
          right: 88,
          fontFamily: sans,
          fontSize: 20,
          color: C.muted,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>Cardrove / {chapter}</span>
        <span>Sample collection</span>
      </div>
    </>
  );
}
function Copy({ number, title, body, kicker }) {
  const f = useCurrentFrame(),
    p = enter(f, 5);
  return (
    <div
      style={{
        position: 'absolute',
        left: 88,
        top: 170,
        width: 510,
        transform: `translateY(${(1 - p) * 34}px)`,
        opacity: p,
      }}
    >
      <div style={{ fontFamily: sans, fontSize: 24, color: C.muted, marginBottom: 45 }}>
        {number} / {kicker}
      </div>
      <h1
        style={{
          fontFamily: serif,
          fontWeight: 400,
          fontSize: 96,
          lineHeight: 1.03,
          letterSpacing: -4,
          margin: '0 0 38px',
          whiteSpace: 'pre-line',
        }}
      >
        {title}
      </h1>
      <p
        style={{
          fontFamily: sans,
          fontSize: 29,
          lineHeight: 1.55,
          color: C.muted,
          maxWidth: 440,
          margin: 0,
        }}
      >
        {body}
      </p>
    </div>
  );
}
function Chapter({ duration, children, endFade = true }) {
  const f = useCurrentFrame();
  const opacity = endFade
    ? interpolate(f, [0, 10, duration - 11, duration - 1], [0, 1, 1, 0], clamp)
    : interpolate(f, [0, 10], [0, 1], clamp);
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
}
function Intro() {
  const f = useCurrentFrame(),
    p = enter(f);
  return (
    <Chapter duration={108}>
      <div
        style={{
          position: 'absolute',
          left: 100,
          top: 100,
          display: 'flex',
          alignItems: 'center',
          gap: 22,
          opacity: p,
        }}
      >
        <Img src={staticFile('cardrove.svg')} style={{ width: 76, height: 76 }} />
        <span style={{ font: '64px ' + serif, letterSpacing: -3 }}>
          Cardrove<span style={{ color: C.accent }}>.</span>
        </span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 112,
          top: 320,
          transform: `translateY(${(1 - p) * 45}px)`,
          opacity: p,
        }}
      >
        <div style={{ font: '136px/1.02 ' + serif, letterSpacing: -6 }}>
          Make room for
          <br />
          <em style={{ color: C.accent }}>what stays.</em>
        </div>
        <p style={{ font: '30px ' + sans, color: C.muted, marginTop: 40 }}>
          Your decks. Your pace. A little, remembered.
        </p>
      </div>
      <div
        style={{
          position: 'absolute',
          right: 135,
          top: 170,
          width: 580,
          height: 650,
          transform: `rotate(${interpolate(f, [0, 108], [-7, -2], clamp)}deg) translateY(${(1 - p) * 70}px)`,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              inset: 0,
              background: i === 2 ? C.white : '#edeae3',
              border: `1px solid ${C.line}`,
              borderRadius: 8,
              transform: `rotate(${(i - 2) * 6}deg) translate(${(i - 2) * -13}px,${(i - 2) * -12}px)`,
            }}
          >
            {i === 2 && (
              <div
                style={{
                  padding: 50,
                  display: 'flex',
                  height: '100%',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ font: '22px ' + sans, color: C.muted }}>
                  01 / Return. Recall. Repeat.
                </span>
                <div style={{ font: '82px/1.1 ' + serif }}>
                  A question.
                  <br />A moment.
                  <br />
                  <em style={{ color: C.accent }}>An answer.</em>
                </div>
                <span style={{ font: '22px ' + sans, color: C.muted }}>A personal study space</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <Footer />
    </Chapter>
  );
}
function ImportScene() {
  const f = useCurrentFrame(),
    p = enter(f),
    change = interpolate(f, [80, 98], [0, 1], clamp);
  return (
    <Chapter duration={204}>
      <Copy
        number="01"
        kicker="Bring your curiosity"
        title={'Bring your\ndecks.'}
        body="Import Anki .apkg files. Keep your subjects together, on a shelf of your own."
      />
      <Screen
        src="import.png"
        y={155 + (1 - p) * 60}
        width={1190}
        style={{ opacity: 1 - change }}
      />
      <Screen src="library.png" y={155 + (1 - p) * 60} width={1190} style={{ opacity: change }} />
      <div
        style={{
          position: 'absolute',
          left: 98,
          top: 760,
          font: '23px ' + sans,
          color: C.accent,
          opacity: enter(f, 60),
        }}
      >
        Languages. Science. The things you want to keep.
      </div>
      <Footer chapter="A collection of your own" />
    </Chapter>
  );
}
function RecallScene() {
  const f = useCurrentFrame(),
    shown = interpolate(f, [70, 82], [0, 1], clamp);
  return (
    <Chapter duration={258}>
      <Copy
        number="02"
        kicker="Your daily practice"
        title={f < 76 ? 'Pause.\nRecall.' : 'Reveal.\nRemember.'}
        body={
          f < 76
            ? 'Give yourself a moment before turning the card.'
            : 'Rate your recall. FSRS schedules the next review.'
        }
      />
      <Screen src="question.png" y={155} width={1190} style={{ opacity: 1 - shown }} />
      <Screen src="answer.png" y={155} width={1190} style={{ opacity: shown }} />
      <div
        style={{
          position: 'absolute',
          left: 92,
          top: 780,
          display: 'flex',
          gap: 14,
          opacity: enter(f, 105),
        }}
      >
        {['1', '2', '3', '4'].map((n, i) => (
          <div
            key={n}
            style={{
              font: '26px ' + sans,
              padding: '15px 25px',
              border: `1px solid ${C.line}`,
              borderRadius: 7,
              background: i === 2 && f > 170 ? C.accent : C.white,
              color: i === 2 && f > 170 ? C.white : C.ink,
              transform: `translateY(${i === 2 && f > 170 ? 4 : 0}px)`,
            }}
          >
            {n}
          </div>
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 98,
          top: 870,
          font: '22px ' + sans,
          color: C.muted,
          opacity: enter(f, 115),
        }}
      >
        Space or Enter to reveal. 1–4 to rate.
      </div>
      <Footer chapter="One card at a time" />
    </Chapter>
  );
}
function DevicesScene() {
  const f = useCurrentFrame(),
    p = enter(f);
  return (
    <Chapter duration={240}>
      <Copy
        number="03"
        kicker="Within reach"
        title={'Any screen.\nYour space.'}
        body="One collection across your connected devices. Add it to your phone’s Home Screen."
      />
      <Screen
        src="answer-dark.png"
        x={780}
        y={190}
        width={1050}
        style={{ transform: `translateX(${(1 - p) * 80}px)` }}
      />
      <Phone
        x={615}
        y={205}
        width={338}
        style={{ transform: `translateY(${(1 - enter(f, 10)) * 80}px)` }}
      />
      <div
        style={{
          position: 'absolute',
          left: 1010,
          top: 895,
          font: '24px/1.5 ' + sans,
          color: C.muted,
          opacity: enter(f, 30),
        }}
      >
        Light or dark. Phone or computer.
        <br />
        Cloud study needs a connection.
      </div>
      <Footer chapter="Connected devices, shared progress" />
    </Chapter>
  );
}
function SettingsScene() {
  const f = useCurrentFrame(),
    p = enter(f);
  return (
    <Chapter duration={246}>
      <Copy
        number="04"
        kicker="Personal, by design"
        title={'A space with\nyour name\non it.'}
        body="Name your workspace. Choose your daily pace. Keep control of your access and progress."
      />
      <Screen src="settings.png" y={155 + (1 - p) * 50} width={1190} />
      <div
        style={{
          position: 'absolute',
          left: 98,
          top: 830,
          font: '24px ' + sans,
          color: C.accent,
          opacity: enter(f, 35),
        }}
      >
        Open source. Self-hosted.
      </div>
      <Footer chapter="Your own installation" />
    </Chapter>
  );
}
function Closing() {
  const f = useCurrentFrame(),
    p = enter(f);
  return (
    <Chapter duration={144} endFade={false}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `translateY(${(1 - p) * 30}px)`,
        }}
      >
        <Img
          src={staticFile('cardrove.svg')}
          style={{ width: 160, height: 160, marginBottom: 20 }}
        />
        <div style={{ font: '148px ' + serif, letterSpacing: -7 }}>
          Cardrove<span style={{ color: C.accent }}>.</span>
        </div>
        <p style={{ font: '35px ' + sans, color: C.muted, margin: '28px 0 48px' }}>
          Your decks. Your pace.
        </p>
        <div
          style={{ font: '25px ' + sans, borderBottom: `1px solid ${C.accent}`, paddingBottom: 12 }}
        >
          Build your study space.
        </div>
        <p style={{ font: '23px ' + sans, color: C.muted, marginTop: 35 }}>
          github.com/ardanngrha/cardrove
        </p>
      </div>
      <Footer chapter="A little, remembered." />
    </Chapter>
  );
}
export function Film() {
  return (
    <AbsoluteFill style={{ background: C.paper, color: C.ink, fontFamily: sans }}>
      <Sequence from={0} durationInFrames={108}>
        <Intro />
      </Sequence>
      <Sequence from={108} durationInFrames={204}>
        <ImportScene />
      </Sequence>
      <Sequence from={312} durationInFrames={258}>
        <RecallScene />
      </Sequence>
      <Sequence from={570} durationInFrames={240}>
        <DevicesScene />
      </Sequence>
      <Sequence from={810} durationInFrames={246}>
        <SettingsScene />
      </Sequence>
      <Sequence from={1056} durationInFrames={144}>
        <Closing />
      </Sequence>
    </AbsoluteFill>
  );
}
export function Poster() {
  return (
    <AbsoluteFill style={{ background: C.paper, color: C.ink, fontFamily: sans }}>
      <div
        style={{
          position: 'absolute',
          left: 90,
          top: 75,
          display: 'flex',
          alignItems: 'center',
          gap: 13,
        }}
      >
        <Img src={staticFile('cardrove.svg')} style={{ width: 60, height: 60 }} />
        <span style={{ font: '48px ' + serif, letterSpacing: -2 }}>Cardrove.</span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 105,
          top: 300,
          font: '108px/1.06 ' + serif,
          letterSpacing: -4,
        }}
      >
        Your decks.
        <br />
        <em style={{ color: C.accent }}>Your pace.</em>
      </div>
      <p
        style={{
          position: 'absolute',
          left: 110,
          top: 592,
          width: 390,
          font: '28px/1.55 ' + sans,
          color: C.muted,
        }}
      >
        A quiet place to practise
        <br />
        what matters to you.
      </p>
      <Screen src="answer-dark.png" x={730} y={155} width={1110} />
      <Phone x={700} y={350} width={285} />
      <div
        style={{
          position: 'absolute',
          left: 110,
          bottom: 80,
          font: '23px ' + sans,
          color: C.muted,
        }}
      >
        40 seconds / A look inside
      </div>
      <div
        style={{
          position: 'absolute',
          right: 90,
          bottom: 80,
          font: '21px ' + sans,
          color: C.muted,
        }}
      >
        Sample collection
      </div>
    </AbsoluteFill>
  );
}
