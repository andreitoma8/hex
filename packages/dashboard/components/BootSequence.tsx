'use client';

import { useEffect, useState } from 'react';

const BOOT_LINES = [
  { text: '> hex v0.3.0',                   delay: 0    },
  { text: '> initializing audit dashboard...', delay: 180  },
  { text: '> loading analysis data',         delay: 380 },
  { text: '> mapping contract graph',        delay: 560 },
  { text: '> scanning attack surface',       delay: 740 },
  { text: '> cross-referencing findings',    delay: 920 },
  { text: '> system ready',                  delay: 1200 },
];

export function BootSequence() {
  const [visible, setVisible] = useState(false);
  const [lines, setLines] = useState<number[]>([]);
  const [fading, setFading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Check if disabled via localStorage
    if (typeof window !== 'undefined' && localStorage.getItem('hex-boot-disabled') === '1') {
      return;
    }
    setVisible(true);

    // Reveal each line
    const timers: ReturnType<typeof setTimeout>[] = [];
    BOOT_LINES.forEach((line, i) => {
      timers.push(setTimeout(() => {
        setLines((prev) => [...prev, i]);
      }, line.delay));
    });

    // Fade out at 1.5s, remove at 1.9s
    timers.push(setTimeout(() => setFading(true), 1500));
    timers.push(setTimeout(() => setDone(true), 1900));

    return () => timers.forEach(clearTimeout);
  }, []);

  const skip = () => {
    setFading(true);
    setTimeout(() => setDone(true), 400);
  };

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent | MouseEvent) => {
      // Don't skip on the very first render frame
      if (e instanceof KeyboardEvent && e.key === 'Tab') return;
      skip();
    };
    window.addEventListener('keydown', handler);
    window.addEventListener('click', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('click', handler);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible || done) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col justify-center px-12 font-mono"
      style={{
        background: '#080808',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.5s ease',
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <div className="max-w-xl space-y-1">
        {BOOT_LINES.map((line, i) => (
          <div
            key={i}
            style={{
              opacity: lines.includes(i) ? 1 : 0,
              transition: 'opacity 0.3s ease',
              fontSize: '13px',
              lineHeight: '1.6',
              color: i === BOOT_LINES.length - 1
                ? '#00cc33'
                : i >= 2
                ? '#aaaaaa'
                : '#00cc33',
            }}
          >
            {line.text}
            {i >= 2 && i < BOOT_LINES.length - 1 && lines.includes(i) && (
              <span style={{ color: '#00cc33', marginLeft: '8px' }}>[OK]</span>
            )}
          </div>
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: '24px',
          right: '24px',
          fontSize: '11px',
          color: '#505050',
        }}
      >
        press any key to skip
      </div>
    </div>
  );
}
