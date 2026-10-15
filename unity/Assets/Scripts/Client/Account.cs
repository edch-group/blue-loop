using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

/// <summary>
/// Your account (account.ts; the server's side is server/accounts.ts): sign up with an email and a password (agreeing
/// to the Terms and the Privacy Policy), or sign in.
///
/// - The save (name, decks, campaign, settings) lives on this device too, and is pushed to the account a moment after
///   each change; signing in loads the account's copy.
/// - The economy (level, experience, currencies, collection, rank) is the server's: this device only keeps a copy to
///   show (Profile), and takes up the server's on every check-in.
/// </summary>
public static class Account
{
    /// <summary>What an account's progress is made of: these keys of this device's storage (Store).</summary>
    public static readonly string[] Synced = { "blue-loop:profile:v1", "blue-loop:decks:v1", "blue-loop:campaign:v6", "blue-loop:runs:v1", "blue-loop:sound", "blue-loop:music", "blue-loop:recent-decks", "blue-loop:ai-speed", "blue-loop:auto-confirm", "blue-loop:hide-starters", "blue-loop:share-stats" };
    /// <summary>The account signed in on this device, and the version of its progress this device last had.</summary>
    const string AccountKey = "blue-loop:account";
    const float PushDelay = 2.5f;

    public class Info
    {
        public string Id;
        public string Email;
        /// <summary>Signs in with a password (false: with Apple or Google only).</summary>
        public bool? Password;
        /// <summary>The account's picture: a card (its id), dealt by the server when the account was made.</summary>
        public string Avatar;
        /// <summary>The server's version of the progress this device has (for spotting a newer copy elsewhere).</summary>
        public long Updated;
    }

    /// <summary>The economy's fields, as the server sends them (it alone changes them).</summary>
    public class Economy
    {
        public int Level, Xp, Stardust, Flux, Played, Won;
        public Dictionary<string, int> Collection;
        public int? RankPoints;
    }

    /// <summary>What a game paid (the reward, with any level-up bonus).</summary>
    public class Payout
    {
        public int Stardust, Flux, Xp, LevelsGained;
        public int? Rank;
    }

    public static Info Current => Store.Read<Info>(AccountKey);
    public static bool SignedIn => Current != null;

    static void Keep(Info a)
    {
        if (a == null) Store.Remove(AccountKey);
        else Store.Write(AccountKey, a);
    }

    static T As<T>(JToken t) where T : class
    {
        if (t == null || t.Type == JTokenType.Null) return null;
        try { return BlueLoop.Engine.Json.Read<T>(t.ToString()); }
        catch { return null; }
    }

    // ---- The save ----

    static bool quiet;

    /// <summary>This device's progress, as it goes to the server.</summary>
    static JObject Collect()
    {
        var o = new JObject();
        foreach (var key in Synced)
        {
            var v = Store.Get(key);
            if (v != null) o[key] = v;
        }
        return o;
    }

    /// <summary>Take a copy of the account's progress onto this device (in place of what was here).</summary>
    static void Apply(JToken save)
    {
        if (!(save is JObject o)) return;
        quiet = true;
        try
        {
            foreach (var key in Synced)
            {
                var v = o[key];
                if (v != null && v.Type == JTokenType.String) Store.Set(key, (string)v);
                else Store.Remove(key);
            }
        }
        finally
        {
            quiet = false;
        }
        Profile.Reload();
    }

    /// <summary>The profile's fields the server keeps for itself (its economy): a save's copy of them is never current.</summary>
    static readonly string[] EconomyFields = { "level", "xp", "stardust", "flux", "collection", "rankPoints", "played", "won" };

    /// <summary>A saved value as compared: the profile without its economy fields (the server's, taken up separately).</summary>
    static string Comparable(string key, string v)
    {
        if (v == null || key != "blue-loop:profile:v1") return v;
        try
        {
            var p = JObject.Parse(v);
            foreach (var f in EconomyFields) p.Remove(f);
            return p.ToString(Newtonsoft.Json.Formatting.None);
        }
        catch
        {
            return v;
        }
    }

    /// <summary>Whether two saves hold the same progress (the economy left out: it is taken up on every check-in).</summary>
    static bool SameSave(JToken a, JObject b)
    {
        if (!(a is JObject o)) return false;
        return Synced.All(k => Comparable(k, (string)o[k]) == Comparable(k, (string)b[k]));
    }

    static void TakeEconomy(JToken e)
    {
        var economy = As<Economy>(e);
        if (economy != null) Profile.SetEconomy(economy);
    }

    /// <summary>A session began (signed up, signed in): keep it, and take up the account's progress.</summary>
    static void Began(JObject d)
    {
        var a = As<Info>(d["account"]) ?? new Info();
        a.Updated = (long?)d["updated"] ?? 0;
        Keep(a);
        if (d["token"] != null) Net.Token = (string)d["token"];
        var save = d["save"];
        bool saved = save != null && save.Type != JTokenType.Null;
        if (saved) Apply(save);
        Profile.Reload();
        TakeEconomy(d["economy"]);
        if (!saved) Schedule(0);
    }

    /// <summary>What went wrong (null: nothing), and whether it was that a new account must agree to the Terms and the Privacy Policy first.</summary>
    public class AuthResult
    {
        public string Error;
        public bool NeedsAgreement;
    }

    static void Session(string path, JObject payload, System.Action<AuthResult> done)
    {
        Net.Api(path, "POST", payload, r =>
        {
            if (r.Ok) Began(r.Data);
            done(new AuthResult { Error = r.Error, NeedsAgreement = (bool?)r.Data["needsAgreement"] ?? false });
        });
    }

    /// <summary>Create an account (this device's settings and decks come along).</summary>
    public static void SignUp(string email, string password, bool acceptTerms, bool acceptPrivacy, System.Action<AuthResult> done) =>
        Session("signup", new JObject { ["email"] = email, ["password"] = password, ["acceptTerms"] = acceptTerms, ["acceptPrivacy"] = acceptPrivacy, ["save"] = Collect() }, done);

    /// <summary>Sign in: the account's progress replaces this device's.</summary>
    public static void LogIn(string email, string password, System.Action<AuthResult> done) =>
        Session("login", new JObject { ["email"] = email, ["password"] = password }, done);

    /// <summary>Ask for a password-reset email. Why not, or null (sent, if the account exists).</summary>
    public static void RequestReset(string email, System.Action<string> done) =>
        Net.Api("reset/request", "POST", new JObject { ["email"] = email }, r => done(r.Error));

    /// <summary>Set a new password from a reset link's token (and sign in).</summary>
    public static void ConfirmReset(string token, string password, System.Action<AuthResult> done) =>
        Session("reset/confirm", new JObject { ["token"] = token, ["password"] = password }, done);

    /// <summary>What the server offers: password reset by email (Apple and Google sign-in are the web's).</summary>
    public static void Config(System.Action<bool> reset) => Net.Api("config", "GET", null, r => reset(r.Ok && ((bool?)r.Data["reset"] ?? false)));

    /// <summary>Take up the account's economy as the server has it now (after an online game, which the server paid).</summary>
    public static void RefreshEconomy(System.Action done = null)
    {
        if (!SignedIn) { done?.Invoke(); return; }
        Net.Api("me", "GET", null, r =>
        {
            if (r.Ok) TakeEconomy(r.Data["economy"]);
            done?.Invoke();
        });
    }

    static void Forget()
    {
        Keep(null);
        Net.Token = null;
        quiet = true;
        try { foreach (var key in Synced) Store.Remove(key); }
        finally { quiet = false; }
        Profile.Reload();
    }

    /// <summary>Sign out: the account's progress leaves this device (it is on the server), and you're a new guest here.</summary>
    public static void LogOut(System.Action done)
    {
        Flush(() => Net.Api("logout", "POST", new JObject(), _ =>
        {
            Forget();
            done();
        }));
    }

    /// <summary>Delete the account and everything in it. Why not, or null once done.</summary>
    public static void Delete(string password, System.Action<string> done)
    {
        Net.Api("delete", "POST", new JObject { ["password"] = password, ["confirm"] = password }, r =>
        {
            if (r.Ok) Forget();
            done(r.Error);
        });
    }

    // ---- Pushing changes ----

    static UnityEngine.Coroutine timer;
    static bool pushing, again;

    // Changes waiting go before the game is left (account.ts: on pagehide, and the page hidden), as far as it allows:
    // sent at once rather than after the push's delay.
    static Account()
    {
        PageLife.Watch();
        PageLife.Leaving += () => Flush(() => { });
    }
    /// <summary>Told when another device's newer progress has replaced this one's.</summary>
    public static event System.Action Replaced;

    /// <summary>A key of the store changed (Store calls this): one of the progress's goes to the account shortly.</summary>
    public static void Touched(string key)
    {
        if (!quiet && System.Array.IndexOf(Synced, key) >= 0) MarkDirty();
    }

    /// <summary>Progress changed on this device: send it to the account shortly (several changes go together).</summary>
    public static void MarkDirty()
    {
        if (SignedIn && Net.Available) Schedule(PushDelay);
    }

    static void Schedule(float delay)
    {
        Net.Cancel(timer);
        timer = Net.After(delay, () =>
        {
            timer = null;
            Push(null);
        });
    }

    static void Push(System.Action done)
    {
        var a = Current;
        if (a == null) { done?.Invoke(); return; }
        if (pushing)
        {
            again = true;
            done?.Invoke();
            return;
        }
        pushing = true;
        Net.Api("save", "PUT", new JObject { ["save"] = Collect(), ["base"] = a.Updated }, r =>
        {
            pushing = false;
            var now = Current;
            if (r.Ok && now != null)
            {
                now.Updated = (long?)r.Data["updated"] ?? now.Updated;
                Keep(now);
            }
            else if (r.Status == 409 && now != null)
            {
                // Another device saved first: its progress wins, and this device takes it up.
                Apply(r.Data["save"]);
                now.Updated = (long?)r.Data["updated"] ?? now.Updated;
                Keep(now);
                Replaced?.Invoke();
            }
            // (The session ended, signed out elsewhere or expired: keep playing here as a guest copy.)
            else if (r.Status == 401) Keep(null);
            // (Offline: try again later.)
            else if (!r.Ok) Schedule(30);
            if (again)
            {
                again = false;
                Schedule(0);
            }
            done?.Invoke();
        });
    }

    /// <summary>Send anything still waiting, now.</summary>
    public static void Flush(System.Action done)
    {
        if (timer == null) { done(); return; }
        Net.Cancel(timer);
        timer = null;
        Push(done);
    }

    /// <summary>
    /// On opening the game: check the session is still good, and take up a newer copy of the progress if another
    /// device saved one. Tells whether this device's progress was replaced.
    /// </summary>
    public static void CheckIn(System.Action<bool> done = null)
    {
        var a = Current;
        if (!Net.Available) { done?.Invoke(false); return; }
        // (Not signed in here, but perhaps on the web game on this same site: its session is a cookie the browser
        // sends by itself. If the server knows this browser, carry on as that account, its progress taken up.)
        if (a == null)
        {
            Net.Api("me", "GET", null, r =>
            {
                if (r.Ok && r.Data["account"] != null && r.Data["account"].Type != JTokenType.Null) Began(r.Data);
                done?.Invoke(r.Ok);
            });
            return;
        }
        Net.Api("me", "GET", null, r =>
        {
            if (!r.Ok)
            {
                if (r.Status == 401) Keep(null);
                done?.Invoke(false);
                return;
            }
            var d = r.Data;
            long updated = (long?)d["updated"] ?? 0;
            // The economy and the picture are the server's: take them up every time.
            TakeEconomy(d["economy"]);
            a.Avatar = As<Info>(d["account"])?.Avatar ?? a.Avatar;
            Keep(a);
            var save = d["save"];
            bool saved = save != null && save.Type != JTokenType.Null;
            if (updated > a.Updated && saved)
            {
                a.Updated = updated;
                Keep(a);
                // Only a copy that differs from this device's needs taking up.
                if (SameSave(save, Collect())) { done?.Invoke(false); return; }
                Apply(save);
                done?.Invoke(true);
                return;
            }
            if (updated < a.Updated || !saved) Schedule(0);
            done?.Invoke(false);
        });
    }

    // ---- Anonymous game summaries ----

    const string ShareStatsKey = "blue-loop:share-stats";

    /// <summary>Whether anonymous game summaries are sent (on unless switched off in the settings).</summary>
    public static bool SharingStats => Store.Get(ShareStatsKey) != "0";

    /// <summary>
    /// A finished game's anonymous summary (BattleView.Stats: the decks, the result, the cards played; nothing about the
    /// players), sent for balancing unless switched off (account.ts sendGameStats). The game's moves go gzipped, as
    /// base64 (a few kilobytes), for training the AI. Never in the way: a failure is just dropped.
    /// </summary>
    public static void SendGameStats(JObject stats)
    {
        if (!SharingStats || !SignedIn || !Net.Available) return;
        var o = (JObject)stats.DeepClone();
        var trace = o["trace"];
        o.Remove("trace");
        if (trace != null)
        {
            try { o["trace64"] = Gzip64(trace.ToString(Newtonsoft.Json.Formatting.None)); }
            catch { /* (Not compressed: sent without it.) */ }
        }
        // (The game's version: the web's is its package's and its build day, __GAME_VERSION__; the build script sets this the same.)
        Net.Api("stats", "POST", new JObject { ["stats"] = o, ["version"] = UnityEngine.Application.version }, _ => { });
    }

    /// <summary>Text, gzipped, as base64.</summary>
    static string Gzip64(string text)
    {
        using var mem = new System.IO.MemoryStream();
        using (var gz = new System.IO.Compression.GZipStream(mem, System.IO.Compression.CompressionMode.Compress))
        {
            var bytes = System.Text.Encoding.UTF8.GetBytes(text);
            gz.Write(bytes, 0, bytes.Length);
        }
        return System.Convert.ToBase64String(mem.ToArray());
    }

    /// <summary>What a reward came to, for under a game's result (app.ts rewardLine).</summary>
    public static string RewardLine(Payout r)
    {
        var p = Profile.Me;
        var line = $"✦ +{r.Stardust}   ⟁ +{r.Flux}   +{r.Xp} xp";
        if (r.LevelsGained > 0) line += $"   <b>level {p.Level}!</b>";
        if (r.Rank != null && p.RankPoints != null) line += $"\n{(r.Rank >= 0 ? "+" : "")}{r.Rank} rank · {BlueLoop.Engine.Progression.RankName(p.RankPoints.Value).ToLowerInvariant()}";
        return line;
    }

    public static Payout PayoutOf(JToken t) => As<Payout>(t);
}
