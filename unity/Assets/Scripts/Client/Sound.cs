using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// The game's sound (sound.ts): its effects and its scores, baked from the web game's own synthesis
/// (scripts/bake-sound.mjs) into Resources/Sound. Effects play over each other; one score plays at a time, looping,
/// faded in and crossfaded as the screen asks for another. Sound and music can each be turned off (kept, as the web's).
/// </summary>
public class Sound : MonoBehaviour
{
    static Sound instance;
    const string MuteKey = "blue-loop:sound", MusicKey = "blue-loop:music";

    readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();
    readonly List<AudioSource> voices = new List<AudioSource>();
    AudioSource musicA, musicB;
    /// <summary>The loop to go on with once the score's first pass (its intro) has played.</summary>
    AudioClip afterIntro;
    string scene;
    float fadeIn = 3;

    public static bool Muted
    {
        get => Store.Get(MuteKey) == "muted";
        set { Store.Set(MuteKey, value ? "muted" : "on"); AudioListener.volume = value ? 0 : 1; }
    }

    public static bool MusicOn
    {
        get => Store.Get(MusicKey) != "off";
        set
        {
            Store.Set(MusicKey, value ? "on" : "off");
            if (instance == null) return;
            var s = instance.scene;
            instance.scene = null;
            if (value) Scene(s);
            else instance.StopMusic();
        }
    }

    static Sound Get()
    {
        if (instance != null || !Application.isPlaying) return instance;
        var go = new GameObject("Sound");
        DontDestroyOnLoad(go);
        instance = go.AddComponent<Sound>();
        instance.musicA = go.AddComponent<AudioSource>();
        instance.musicB = go.AddComponent<AudioSource>();
        foreach (var m in new[] { instance.musicA, instance.musicB })
        {
            m.loop = true;
            m.playOnAwake = false;
            m.volume = 0;
        }
        AudioListener.volume = Muted ? 0 : 1;
        if (Object.FindAnyObjectByType<AudioListener>() == null) go.AddComponent<AudioListener>();
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
        if (s == null) return;
        var clip = s.Clip(name);
        if (clip == null) return;
        var v = s.voices.Find(x => !x.isPlaying) ?? s.NewVoice();
        v.clip = clip;
        v.volume = volume;
        if (delay > 0) v.PlayDelayed(delay);
        else v.Play();
    }

    /// <summary>A recording (a voice line) through the same voices as the effects.</summary>
    public static void PlayClip(AudioClip clip, float volume = 0.85f)
    {
        var s = Get();
        if (s == null || clip == null) return;
        var v = s.voices.Find(x => !x.isPlaying) ?? s.NewVoice();
        v.clip = clip;
        v.volume = volume;
        v.Play();
    }

    AudioSource NewVoice()
    {
        var v = gameObject.AddComponent<AudioSource>();
        v.playOnAwake = false;
        voices.Add(v);
        return v;
    }

    /// <summary>A sized effect: "hurt", "strike" and "clash" come in amounts 1 to 5.</summary>
    public static void Play(string name, int amount) => Play($"{name}-{Mathf.Clamp(amount, 1, 5)}");

    /// <summary>
    /// The score the screen wants: "voyage" (the menus), "ambient" (the campaign map), "battle", "boss". It fades
    /// in as the web's does (the battle's over three seconds, the menus' over six), crossfading from the last.
    /// </summary>
    public static void Scene(string name)
    {
        var s = Get();
        if (s == null || name == s.scene) return;
        s.scene = name;
        if (!MusicOn) return;
        // (The page's audio only runs from the first tap, click or key: until then the score waits, and starts from its
        // beginning then, as the web's unlock does. Started before, it ran on unheard and came in partway through.)
        if (!unlocked) return;
        s.StartScene(name);
    }

    /// <summary>Whether the player has tapped, clicked or pressed a key yet (the browser's audio allowed).</summary>
    static bool unlocked = !Application.isPlaying || Application.platform != RuntimePlatform.WebGLPlayer;

    void StartScene(string name)
    {
        var s = this;
        var clip = s.Clip("music-" + name);
        if (clip == null) return;
        // (The one fading out swaps to the back; the new one starts from silence.)
        (s.musicA, s.musicB) = (s.musicB, s.musicA);
        // (Its first pass from silence, then the pass that loops: the looping one has its end's ringing folded back
        // over its start, which, played first, layered the end's chords over the score's opening.)
        var intro = s.Clip("music-" + name + "-intro");
        s.afterIntro = intro != null ? clip : null;
        s.musicA.clip = intro ?? clip;
        s.musicA.loop = intro == null;
        s.musicA.volume = 0;
        s.musicA.time = 0;
        s.musicA.Play();
        // (sound.ts faders: the battle theme in over 3 s, the ambient over 6, the voyage and the boss's at once.)
        s.fadeIn = name == "battle" ? 3 : name == "ambient" ? 6 : 0.05f;
    }

    void StopMusic()
    {
        afterIntro = null;
        musicA.Stop();
        musicB.Stop();
    }

    void Update()
    {
        // The first tap, click or key: the score starts, from its beginning.
        if (!unlocked && (Input.GetMouseButtonUp(0) || Input.anyKeyDown || (Input.touchCount > 0 && Input.GetTouch(0).phase == TouchPhase.Ended)))
        {
            unlocked = true;
            if (scene != null && MusicOn) StartScene(scene);
        }
        // (The intro over: the loop, from its start, without a break.)
        if (afterIntro != null && musicA.clip != afterIntro && (!musicA.isPlaying || musicA.time >= musicA.clip.length - Time.unscaledDeltaTime))
        {
            musicA.clip = afterIntro;
            musicA.loop = true;
            musicA.time = 0;
            musicA.Play();
            afterIntro = null;
        }
        float level = 0.9f;
        if (musicA.isPlaying) musicA.volume = Mathf.MoveTowards(musicA.volume, level, Time.unscaledDeltaTime * level / Mathf.Max(0.05f, fadeIn));
        if (musicB.isPlaying)
        {
            musicB.volume = Mathf.MoveTowards(musicB.volume, 0, Time.unscaledDeltaTime * level / 1.5f);
            if (musicB.volume <= 0) musicB.Stop();
        }
    }

    void OnApplicationPause(bool paused) => AudioListener.pause = paused;
}
