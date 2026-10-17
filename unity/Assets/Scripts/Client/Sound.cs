using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// The game's sound (sound.ts): its effects and its scores, baked from the web game's own synthesis
/// (scripts/bake-sound.mjs) into Resources/Sound. Effects play over each other; one score plays at a time, looping,
/// faded in and crossfaded as the screen asks for another. Sound and music can each be turned off (kept, as the web's).
///
/// The mixing desk is the web's, baked in: every clip was rendered through the web's own (bake/bake.ts builds the live
/// board), so each already carries its fader's level (the battle theme's 1.2, the boss track's 1.4, the voyage's 0.6,
/// the ambient score's 0.5), the hall (its reverb, or the smaller room's), the master's 0.8 and its gentle limiter;
/// played here at full volume they sound as the web plays them. The heroes' recorded lines too are baked through the
/// hall as sound.ts clip plays them (in place of a Unity AudioReverbFilter, which the browser build can't run: the
/// web's hall is a 4.5 s noise impulse decaying as (1 - t/4.5)^2.6, sent at 0.55, the smaller room the same at half
/// the send). Where Unity mixes several clips at once, a peak limiter on the listener keeps their sum from clipping,
/// as the web's limiter does its mix (desktop and mobile: the browser build can't filter its output).
/// </summary>
public class Sound : MonoBehaviour
{
    static Sound instance;
    const string MuteKey = "blue-loop:sound", MusicKey = "blue-loop:music";

    readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();
    readonly List<AudioSource> voices = new List<AudioSource>();
    /// <summary>The score sounding (A) and the one fading out behind it (B).</summary>
    AudioSource musicA, musicB;
    /// <summary>
    /// Each score's looping pass, beside its intro (musicA's, musicB's): it comes in as the intro ends, on a source of its
    /// own, the intro left to play out its last moment rather than cut short (a click). (Not set going ahead with a
    /// delay: in the browser build the delay was not kept, and the loop, whose start carries the end's chords folded
    /// back over it, came in at once over the score's opening bass note.)
    /// </summary>
    AudioSource loopA, loopB;
    /// <summary>When the front score started (unscaled seconds), and its intro's length (0: none): which pass is sounding.</summary>
    float startedAt, introLength;
    /// <summary>The score the screen wants, and whether it runs backwards (Time Dense Space).</summary>
    string scene;
    bool reversed;
    /// <summary>Whether a score is sounding (sound.ts playing).</summary>
    bool playing;
    /// <summary>The fade in (sound.ts faders: exponential, from silence to the score's level, over this long) and the fade out behind it.</summary>
    float fadeIn = 3, fadeFrom = 0.0001f, fadeAt, outFrom, outAt = -10;

    public static bool Muted
    {
        get => Store.Get(MuteKey) == "muted";
        set
        {
            Store.Set(MuteKey, value ? "muted" : "on");
            // (sound.ts toggleMute: muted, the score fades out and nothing new sounds; back on, the score starts again.)
            var s = Get();
            if (s == null) return;
            if (value) s.StopMusic(false);
            else if (MusicOn) s.StartMusic();
        }
    }

    public static bool MusicOn
    {
        get => Store.Get(MusicKey) != "off";
        set
        {
            Store.Set(MusicKey, value ? "on" : "off");
            // (sound.ts toggleMusic: on, the score starts from its top; off, it fades out.)
            var s = Get();
            if (s == null) return;
            if (value && !Muted) s.StartMusic();
            else s.StopMusic(false);
        }
    }

    static Sound Get()
    {
        if (instance != null || !Application.isPlaying) return instance;
        var go = new GameObject("Sound");
        DontDestroyOnLoad(go);
        instance = go.AddComponent<Sound>();
        // (The sources on an object of their own: the limiter, an audio filter, rides on the listener's object, and a
        // filter may only be on an object with one listener or source.)
        instance.sources = new GameObject("Sources");
        instance.sources.transform.SetParent(go.transform, false);
        instance.musicA = instance.sources.AddComponent<AudioSource>();
        instance.musicB = instance.sources.AddComponent<AudioSource>();
        instance.loopA = instance.sources.AddComponent<AudioSource>();
        instance.loopB = instance.sources.AddComponent<AudioSource>();
        foreach (var m in new[] { instance.musicA, instance.musicB, instance.loopA, instance.loopB })
        {
            m.loop = true;
            m.playOnAwake = false;
            m.volume = 0;
        }
        if (Object.FindAnyObjectByType<AudioListener>() == null) go.AddComponent<AudioListener>();
        // Leaving the app (home screen, app switcher, locking the phone, another tab) silences the game; coming back
        // starts the score again from its top (sound.ts sleep, wake).
        PageLife.Watch();
        PageLife.Hidden += instance.OnHidden;
        return instance;
    }

    AudioClip Clip(string name)
    {
        if (!clips.TryGetValue(name, out var c)) clips[name] = c = Resources.Load<AudioClip>("Sound/" + name);
        return c;
    }

    /// <summary>One effect (by its baked name: "play", "hurt-3", "impact-hot"…), after `delay` seconds.</summary>
    public static void Play(string name, float delay = 0, float volume = 1)
    {
        var s = Get();
        if (s == null || Muted || !MaySound(name)) return;
        s.Voice(s.Clip(name), delay, volume);
    }

    void Voice(AudioClip clip, float delay, float volume)
    {
        if (clip == null) return;
        var v = voices.Find(x => !x.isPlaying) ?? NewVoice();
        v.clip = clip;
        v.volume = volume;
        if (delay > 0) v.PlayDelayed(delay);
        else v.Play();
    }

    static float lastHover = -10, lastRustle = -10, lastHandLift = -10;

    /// <summary>
    /// The web's throttles (sound.ts hover, rustle, handLift): a hover at most every 90 ms, a rustle every 70; the hand
    /// lifting once in 900 ms (it can lift twice in a breath, as the pointer grazes its edge), counted as a rustle too.
    /// Whether it may sound now.
    /// </summary>
    static bool MaySound(string name)
    {
        float now = Time.realtimeSinceStartup;
        switch (name)
        {
            case "hover":
                if (now - lastHover < 0.09f) return false;
                lastHover = now;
                return true;
            case "rustle":
                if (now - lastRustle < 0.07f) return false;
                lastRustle = now;
                return true;
            case "hand-lift":
                if (now - lastHandLift < 0.9f) return false;
                lastHandLift = lastRustle = now;
                return true;
            default:
                return true;
        }
    }

    /// <summary>A recording (a voice line, baked through the hall as sound.ts clip plays it) through the same voices as the effects.</summary>
    public static void PlayClip(AudioClip clip, float volume = 1)
    {
        var s = Get();
        if (s == null || Muted) return;
        s.Voice(clip, 0, volume);
    }

    AudioSource NewVoice()
    {
        var v = sources.AddComponent<AudioSource>();
        v.playOnAwake = false;
        voices.Add(v);
        return v;
    }

    /// <summary>A sized effect: "hurt", "strike" and "clash" come in amounts 1 to 5.</summary>
    public static void Play(string name, int amount) => Play($"{name}-{Mathf.Clamp(amount, 1, 5)}");

    // ---- The star chime, in tune with the score ----

    /// <summary>A Minor's pentatonic: the star chime's notes with no score sounding.</summary>
    static readonly int[] Pentatonic = { 9, 0, 2, 4, 7 };
    /// <summary>The chord the score is sounding (its pitch classes), as it changes (sound.ts tones, hearChord).</summary>
    int[] tones = Pentatonic;
    /// <summary>Each baked pass's chords, [second, pitch classes] (Resources/Sound/chords.json, made with the scores).</summary>
    static Dictionary<string, Chords> chordMap;

    class Chords
    {
        public float loop;
        public List<List<object>> at;
    }

    /// <summary>
    /// A star under the pointer (sound.ts starHover): a soft glassy chime, each star its own note: a tone of the chord the
    /// score is sounding (A minor's pentatonic with none), from E5 up two octaves, picked by the star's seed; its shimmer
    /// the chord's next tone up, a moment after. At most every 60 ms (shared with the hover's).
    /// </summary>
    public static void StarHover(double seed)
    {
        var s = Get();
        if (s == null || Muted) return;
        float now = Time.realtimeSinceStartup;
        if (now - lastHover < 0.06f) return;
        lastHover = now;
        var tones = s.playing ? s.tones : Pentatonic;
        var ladder = new List<int>();
        for (int n = 76; n <= 100; n++) if (System.Array.IndexOf(tones, n % 12) >= 0) ladder.Add(n);
        if (ladder.Count == 0) return;
        int at = (int)(System.Math.Floor(System.Math.Abs(seed) * 997) % ladder.Count);
        int up = at + 2 < ladder.Count ? ladder[at + 2] : ladder[at] + 12;
        s.Voice(s.Clip($"star-{ladder[at]}"), 0, 1);
        s.Voice(s.Clip($"star-up-{up}"), 0.04f, 1);
    }

    /// <summary>A system's seed for its chime (campaign.ts seedOf: a stable 0 to 0.999 per id).</summary>
    public static double SeedOf(string id)
    {
        uint h = 0;
        foreach (var ch in id) h = unchecked(h * 31 + ch);
        return (h % 1000) / 1000.0;
    }

    /// <summary>The chord sounding at this point of the forward score (kept while it runs backwards, as the web's is).</summary>
    void HearChord()
    {
        if (!playing || reversed || musicA.clip == null || !musicA.isPlaying) return;
        // (The pass sounding: the intro until its end, then the loop, round and round.)
        var front = introLength > 0 && Time.unscaledTime - startedAt >= introLength ? loopA : musicA;
        if (front.clip == null) return;
        if (chordMap == null)
        {
            var text = Resources.Load<TextAsset>("Sound/chords")?.text;
            try { chordMap = text != null ? Newtonsoft.Json.JsonConvert.DeserializeObject<Dictionary<string, Chords>>(text) : new Dictionary<string, Chords>(); }
            catch { chordMap = new Dictionary<string, Chords>(); }
        }
        if (!chordMap.TryGetValue(front.clip.name, out var c) || c.at == null || c.at.Count == 0) return;
        float t = front == loopA ? (Time.unscaledTime - startedAt - introLength) % Mathf.Max(0.01f, front.clip.length) : musicA.time;
        // (Before a pass's first chord: the last of the pass before, round the loop; a first pass from silence keeps what was.)
        List<object> now = front.loop ? c.at[c.at.Count - 1] : null;
        foreach (var e in c.at)
        {
            if (System.Convert.ToSingle(e[0]) > t) break;
            now = e;
        }
        if (now == null) return;
        var pcs = ((Newtonsoft.Json.Linq.JArray)now[1]).ToObject<int[]>();
        if (pcs.Length > 0) tones = pcs;
    }

    // ---- The boosters ----

    AudioSource thrust;
    bool thrustOn;
    float thrustOffAt;

    /// <summary>
    /// A ship's boosters, for as long as it is under way (sound.ts thrust): on, the roar swells in from the first moment
    /// (eased toward its level, 0.2 s to settle); off, it dies away over 1.1 s and stops.
    /// </summary>
    public static void Thrust(bool on)
    {
        var s = Get();
        if (s == null || on == s.thrustOn) return;
        if (on)
        {
            if (Muted) return;
            if (s.thrust == null)
            {
                s.thrust = s.sources.AddComponent<AudioSource>();
                s.thrust.playOnAwake = false;
                s.thrust.loop = true;
                s.thrust.volume = 0;
            }
            s.thrustOn = true;
            if (!s.thrust.isPlaying)
            {
                s.thrust.clip = s.Clip("thrust");
                if (s.thrust.clip == null) { s.thrustOn = false; return; }
                s.thrust.volume = 0;
                s.thrust.Play();
            }
            return;
        }
        s.thrustOn = false;
        s.thrustOffAt = Time.unscaledTime;
        s.outThrust = Mathf.Max(s.thrust != null ? s.thrust.volume : 0, 0.0001f);
    }

    float outThrust;

    void ThrustTick()
    {
        if (thrust == null || !thrust.isPlaying) return;
        if (thrustOn) thrust.volume += (1 - thrust.volume) * (1 - Mathf.Exp(-Time.unscaledDeltaTime / 0.2f));
        else
        {
            float k = (Time.unscaledTime - thrustOffAt) / 1.1f;
            thrust.volume = k >= 1 ? 0 : outThrust * Mathf.Pow(0.0001f / outThrust, k);
            if (Time.unscaledTime - thrustOffAt >= 1.3f) thrust.Stop();
        }
    }

    // ---- The scores ----

    /// <summary>
    /// The score the screen wants: "voyage" (the menus), "ambient" (the campaign map), "battle", "boss"; `reverse`,
    /// played backwards (Time Dense Space: app.ts render, sound.ts setReverse). It fades in as the web's does (the
    /// battle's over three seconds, the ambient over six, the voyage's, the boss's and a reversed score at once), the
    /// last fading out over two.
    /// </summary>
    public static void Scene(string name, bool reverse = false)
    {
        var s = Get();
        if (s == null || (name == s.scene && reverse == s.reversed)) return;
        s.scene = name;
        s.reversed = reverse;
        if (s.playing) s.StopMusic(false);
        // (The page's audio only runs from the first tap, click or key: until then the score waits, and starts from its
        // beginning then, as the web's unlock does. Started before, it ran on unheard and came in partway through.)
        if (!MusicOn || Muted || !unlocked || hidden) return;
        s.StartMusic();
    }

    /// <summary>Time running backwards, or forwards again (sound.ts setReverse): the score the screen wants, the other way.</summary>
    public static void SetReverse(bool on)
    {
        var s = Get();
        if (s != null && s.scene != null) Scene(s.scene, on);
    }

    /// <summary>Whether the player has tapped, clicked or pressed a key yet (the browser's audio allowed).</summary>
    static bool unlocked = !Application.isPlaying || Application.platform != RuntimePlatform.WebGLPlayer;
    /// <summary>The game is out of sight.</summary>
    static bool hidden;

    /// <summary>sound.ts startMusic: the score the screen wants, from its top.</summary>
    void StartMusic()
    {
        if (scene == null || playing || !MusicOn || Muted || !unlocked || hidden) return;
        // (A reversed score: its loop back to front, from its end; forwards, its first pass from silence, then the pass
        // that loops: the looping one has its end's ringing folded back over its start, which, played first, layered the
        // end's chords over the score's opening.)
        var clip = Clip("music-" + scene + (reversed ? "-reverse" : ""));
        if (clip == null) return;
        // (In front, from silence: the last one has gone to the back to fade, stopMusic.)
        var intro = reversed ? null : Clip("music-" + scene + "-intro");
        musicA.clip = intro ?? clip;
        musicA.loop = intro == null;
        musicA.volume = 0;
        musicA.time = 0;
        musicA.Play();
        introLength = 0;
        if (intro != null)
        {
            // (The loop, on the audio clock, from the intro's last sample: its length as made, any padding the encoder
            // put after its end overlapping the loop's start, silent.)
            introLength = intro.samples / (float)intro.frequency;
            loopA.Stop();
            loopA.clip = clip;
            loopA.loop = true;
            loopA.volume = 0;
            loopA.time = 0;
        }
        startedAt = Time.unscaledTime;
        playing = true;
        // (sound.ts faders: the battle theme in over 3 s, the ambient over 6, the voyage's, the boss's and a reversed score at once.)
        fadeIn = reversed ? 0.05f : scene == "battle" ? 3 : scene == "ambient" ? 6 : 0.05f;
        fadeFrom = 0.0001f;
        fadeAt = Time.unscaledTime;
    }

    /// <summary>sound.ts stopMusic: the score fades out over 2 s (exponentially, as the web's ramp), or, `now`, stops at once.</summary>
    void StopMusic(bool now)
    {
        if (!playing && !now) return;
        playing = false;
        tones = Pentatonic;
        if (now)
        {
            musicA.Stop();
            musicB.Stop();
            loopA.Stop();
            loopB.Stop();
            outAt = -10;
            return;
        }
        // (The front one goes to the back to fade; whatever was fading there already is let go.)
        musicB.Stop();
        loopB.Stop();
        (musicA, musicB) = (musicB, musicA);
        (loopA, loopB) = (loopB, loopA);
        BeginFadeOut();
    }

    void BeginFadeOut()
    {
        outFrom = Mathf.Max(Mathf.Max(musicB.volume, loopB.volume), 0.0001f);
        outAt = Time.unscaledTime;
    }

    /// <summary>sound.ts sleep and wake: hidden, the score cut and everything paused; back, the score from its top.</summary>
    void OnHidden(bool now)
    {
        if (now == hidden) return;
        hidden = now;
        if (now)
        {
            StopMusic(true);
            AudioListener.pause = true;
            return;
        }
        AudioListener.pause = false;
        StartMusic();
    }

    void Update()
    {
        // The first tap, click or key: the score starts, from its beginning.
        if (!unlocked && (Input.GetMouseButtonUp(0) || Input.anyKeyDown || (Input.touchCount > 0 && Input.GetTouch(0).phase == TouchPhase.Ended)))
        {
            unlocked = true;
            StartMusic();
        }
        // (The intro over, by the clock since it began (its source's own time can lag as it starts in the browser): the
        // loop, from its start.)
        if (playing && introLength > 0 && loopA.clip != null && !loopA.isPlaying && Time.unscaledTime - startedAt >= introLength - Time.unscaledDeltaTime)
        {
            loopA.time = 0;
            loopA.Play();
        }
        // (Each fader's ramp: in, exponentially from silence to the level baked in; out, down to silence over 2 s.)
        if (playing)
        {
            float k = Mathf.Clamp01((Time.unscaledTime - fadeAt) / Mathf.Max(0.05f, fadeIn));
            musicA.volume = loopA.volume = fadeFrom * Mathf.Pow(1 / fadeFrom, k);
        }
        if ((musicB.isPlaying || loopB.isPlaying) && outAt >= 0)
        {
            float t = Time.unscaledTime - outAt;
            musicB.volume = loopB.volume = t >= 2 ? 0 : outFrom * Mathf.Pow(0.0001f / outFrom, t / 2);
            if (t >= 2.2f)
            {
                musicB.Stop();
                loopB.Stop();
                outAt = -10;
            }
        }
        HearChord();
        ThrustTick();
        // (The limiter rides on whichever listener hears the game.)
        if (Time.unscaledTime >= limiterCheck)
        {
            limiterCheck = Time.unscaledTime + 1;
            var listener = FindAnyObjectByType<AudioListener>();
            if (listener != null && listener.GetComponent<Limiter>() == null) listener.gameObject.AddComponent<Limiter>();
        }
    }

    float limiterCheck;
    GameObject sources;

    /// <summary>
    /// The master (sound.ts build: 0.8) and a gentle peak limiter on everything heard ("so swells never clip"): above 0.9
    /// the gain comes down at once, and recovers over a quarter second. (Not in the browser build, which can't filter its
    /// output: its page puts the web's own master and limiter after the game's sound, WebGLTemplates/Fill.)
    /// </summary>
    class Limiter : MonoBehaviour
    {
        float gain = 1, release;
        void Awake() => release = Mathf.Exp(-1f / (0.25f * AudioSettings.outputSampleRate));
        void OnAudioFilterRead(float[] data, int channels)
        {
            const float ceiling = 0.9f;
            for (int i = 0; i < data.Length; i += channels)
            {
                float peak = 0;
                for (int c = 0; c < channels; c++) peak = Mathf.Max(peak, Mathf.Abs(data[i + c] *= 0.8f));
                float want = peak > ceiling ? ceiling / peak : 1;
                gain = want < gain ? want : want - (want - gain) * release;
                for (int c = 0; c < channels; c++) data[i + c] *= gain;
            }
        }
    }
}
