import { markDirty } from './account';
import { sound } from './sound';
import { pageRect } from './viewport';

/**
 * Command cards are heroes: each says a line as it takes the field, spoken by
 * the device's own speech voice (no recordings yet) and shown as a caption
 * beside the card. Each hero has its own lines, a voice of their own (chosen
 * from the device's English voices) and their own pitch and pace.
 *
 * Recorded lines can replace the speech later: put them in public/voice/ as
 * <card id>-<line number>.mp3 and add the card id to RECORDED.
 */

interface Hero {
  lines: string[];
  /** Whose voice: picked from the device's voices by these names first, then by gender. */
  voice: 'female' | 'male';
  pitch: number;
  rate: number;
}

const HEROES: Record<string, Hero> = {
  // Aureline: the sun-priests.
  command_directive: { voice: 'female', pitch: 1.1, rate: 0.95, lines: ['The light holds. Take your places.', 'By the white flame, we stand.', 'Solarch Veyra, at your side.'] },
  ignition_protocol: { voice: 'male', pitch: 0.85, rate: 1.0, lines: ['Light them up!', 'Sol-Marshal Aurex. Let them burn.', 'Every star can be made to blaze.'] },
  // Xel'Naru: the crystal ascetics.
  war_council: { voice: 'female', pitch: 1.25, rate: 0.85, lines: ['Nothing is lost. Everything returns.', 'The shards remember.', 'Archon Seris. The council is with you.'] },
  coolant_protocol: { voice: 'male', pitch: 0.95, rate: 0.82, lines: ['Be still. Be cold. Be certain.', 'Hierarch Vael. Let the fire fade.', 'Patience is a blade of ice.'] },
  // Vorthane: the tide fleets.
  tide_regent: { voice: 'female', pitch: 0.9, rate: 0.9, lines: ['The tide rises with us.', 'Tide-Regent Osshara. Hold the line.', 'Let them break upon us.'] },
  the_admiralty: { voice: 'male', pitch: 0.7, rate: 0.88, lines: ['The Admiralty has the fleet.', 'All hands. Shields to full.', 'We have weathered worse than you.'] },
  // Ixquor: the hive.
  chamber_protocol: { voice: 'female', pitch: 0.6, rate: 0.8, lines: ['Grow, my children. Grow.', "Ul'Kha wakes. The brood follows.", 'Every root, a promise.'] },
  logistics_command: { voice: 'male', pitch: 1.4, rate: 1.1, lines: ['The hive speaks through me.', 'Zyth hears. Zyth obeys. Zyth spreads.', 'Many voices. One will.'] },
};

/** Cards with recorded lines in public/voice/ (none yet). */
const RECORDED = new Set<string>();

const VOICES_KEY = 'blue-loop:voices';
/** Names of the better device voices, by gender (iOS, macOS, Windows, Chrome). */
const PREFERRED: Record<Hero['voice'], string[]> = {
  female: ['Samantha', 'Karen', 'Moira', 'Tessa', 'Serena', 'Kate', 'Fiona', 'Victoria', 'Google UK English Female', 'Microsoft Zira', 'Microsoft Libby', 'Microsoft Sonia'],
  male: ['Daniel', 'Arthur', 'Oliver', 'Rishi', 'Alex', 'Fred', 'Aaron', 'Google UK English Male', 'Microsoft David', 'Microsoft Guy', 'Microsoft Ryan'],
};

class Voices {
  on = true;
  private last: Record<string, number> = {};
  private caption: HTMLElement | null = null;
  private captionTimer = 0;

  constructor() {
    try {
      this.on = localStorage.getItem(VOICES_KEY) !== 'off';
    } catch {
      // Storage unavailable: on.
    }
    // Some browsers load their voices only once asked. iOS speaks only after speech has been started
    // from a tap (a hero takes the field a moment after one), so start a silent line on the first.
    window.speechSynthesis?.getVoices();
    const unlock = () => {
      const synth = window.speechSynthesis;
      if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      synth.speak(u);
    };
    window.addEventListener('pointerup', unlock, { once: true, capture: true });
  }

  toggle() {
    this.on = !this.on;
    try {
      localStorage.setItem(VOICES_KEY, this.on ? 'on' : 'off');
      markDirty();
    } catch {
      // ignore
    }
    if (!this.on) window.speechSynthesis?.cancel();
  }

  /** Whether this card is a hero with lines. */
  has(defId: string): boolean {
    return defId in HEROES;
  }

  /** A hero takes the field: say one of their lines (not the one they said last), captioned beside their card. */
  speak(defId: string, card: Element | null) {
    const hero = HEROES[defId];
    if (!hero || !this.on || sound.muted) return;
    const n = hero.lines.length;
    let i = Math.floor(Math.random() * n);
    if (n > 1 && i === this.last[defId]) i = (i + 1) % n;
    this.last[defId] = i;
    const line = hero.lines[i];
    this.showCaption(line, card);
    if (RECORDED.has(defId)) {
      void new Audio(`/voice/${defId}-${i + 1}.mp3`).play().catch(() => undefined);
      return;
    }
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
    synth.cancel(); // a new hero talks over the last
    const u = new SpeechSynthesisUtterance(line);
    const voice = pickVoice(synth.getVoices(), hero, defId);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? 'en-GB';
    u.pitch = hero.pitch;
    u.rate = hero.rate;
    u.volume = 1;
    synth.speak(u);
  }

  private showCaption(text: string, card: Element | null) {
    this.caption?.remove();
    window.clearTimeout(this.captionTimer);
    const el = document.createElement('div');
    el.className = 'hero-line';
    el.textContent = `“${text}”`;
    document.body.appendChild(el);
    if (card) {
      const r = pageRect(card);
      el.style.left = `${r.left + r.width / 2}px`;
      // Above the card, or below it when it sits at the top of the board (the rival's side).
      const below = r.top < 70;
      el.style.top = `${below ? r.bottom : r.top}px`;
      el.classList.toggle('hero-line-below', below);
    } else el.classList.add('hero-line-free');
    this.caption = el;
    this.captionTimer = window.setTimeout(() => {
      el.classList.add('hero-line-out');
      window.setTimeout(() => el.remove(), 400);
    }, 2600 + text.length * 30);
  }
}

/** The hero's voice: a preferred English voice of their gender, else any English voice, the same one each time. */
function pickVoice(all: SpeechSynthesisVoice[], hero: Hero, defId: string): SpeechSynthesisVoice | null {
  const english = all.filter((v) => v.lang?.toLowerCase().startsWith('en'));
  if (!english.length) return null;
  const named = PREFERRED[hero.voice].map((name) => english.find((v) => v.name.startsWith(name))).filter((v): v is SpeechSynthesisVoice => !!v);
  const pool = named.length ? named : english;
  // Heroes of the same gender get different voices where the device has several.
  const same = Object.entries(HEROES).filter(([, h]) => h.voice === hero.voice).map(([id]) => id);
  return pool[Math.max(0, same.indexOf(defId)) % pool.length];
}

export const voices = new Voices();
