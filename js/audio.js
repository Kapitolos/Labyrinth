export function createAudio() {
  let ctx = null;
  const api = {
    muted: false,
    unlock() {
      const ac = context();
      if (ac && ac.state === 'suspended') ac.resume();
    },
    play(name) {
      if (api.muted) return;
      const ac = context();
      if (!ac) return;
      if (ac.state === 'suspended') ac.resume();
      const t = ac.currentTime;
      if (name === 'swing') tone(ac, t, 240, 0.06, 'square', 0.03, 80);
      else if (name === 'arrow') tone(ac, t, 640, 0.06, 'square', 0.03, -280);
      else if (name === 'spell') tone(ac, t, 420, 0.12, 'sine', 0.04, 260);
      else if (name === 'charge') {
        tone(ac, t, 180, 0.16, 'sawtooth', 0.035, 460);
        tone(ac, t, 540, 0.12, 'triangle', 0.03, 180);
      } else if (name === 'clink') tone(ac, t, 640, 0.05, 'square', 0.025, -200);
      else if (name === 'hit') tone(ac, t, 160, 0.08, 'triangle', 0.04, -40);
      else if (name === 'boss') {
        tone(ac, t, 110, 0.22, 'sawtooth', 0.05, -50);
        tone(ac, t + 0.02, 220, 0.14, 'square', 0.03, 40);
      } else if (name === 'hurt') tone(ac, t, 210, 0.14, 'sawtooth', 0.04, -130);
      else if (name === 'die') tone(ac, t, 180, 0.36, 'triangle', 0.05, -140);
      else if (name === 'chest') {
        tone(ac, t, 523, 0.08, 'sine', 0.04, 0);
        tone(ac, t + 0.07, 784, 0.12, 'sine', 0.04, 0);
      } else if (name === 'glint') tone(ac, t, 880, 0.09, 'sine', 0.035, 120);
      else if (name === 'heal') {
        tone(ac, t, 440, 0.08, 'sine', 0.035, 0);
        tone(ac, t + 0.06, 660, 0.1, 'sine', 0.03, 0);
      } else if (name === 'lever') {
        tone(ac, t, 90, 0.22, 'sawtooth', 0.05, -30);
        tone(ac, t, 180, 0.12, 'square', 0.03, -80);
      } else if (name === 'horn') tone(ac, t, 70, 0.38, 'sawtooth', 0.05, 20);
      else if (name === 'pop') tone(ac, t, 320, 0.06, 'square', 0.03, -80);
      else if (name === 'win') {
        [523, 659, 784, 1046].forEach((freq, i) => {
          tone(ac, t + i * 0.11, freq, 0.18, 'triangle', 0.04, 0);
        });
      }
    },
  };

  function context() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  }

  return api;
}

function tone(ac, time, freq, dur, type, gain, slide) {
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(40, freq), time);
  if (slide) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), time + dur);
  }
  amp.gain.setValueAtTime(gain, time);
  amp.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(amp);
  amp.connect(ac.destination);
  osc.start(time);
  osc.stop(time + dur + 0.02);
}
