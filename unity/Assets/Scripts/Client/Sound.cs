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
        var clip = s.Clip("music-" + name);
        if (clip == null) return;
        // (The one fading out swaps to the back; the new one starts from silence.)
        (s.musicA, s.musicB) = (s.musicB, s.musicA);
        s.musicA.clip = clip;
        s.musicA.volume = 0;
        s.musicA.Play();
        s.fadeIn = name == "battle" ? 3 : name == "ambient" ? 6 : 0.6f;
    }

    void StopMusic()
    {
        musicA.Stop();
        musicB.Stop();
    }

    void Update()
    {
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
