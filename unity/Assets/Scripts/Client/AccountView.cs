using System.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using K = MenuKit;

/// <summary>
/// Signing in (app.ts renderSignIn): to your account with an email and a password, creating one (agreeing to the Terms
/// and the Privacy Policy), asking for a new password by email, or choosing one from the email's link; then the name
/// you go by, beside the picture the account was dealt. Enter sends the form. Also the account's part of your profile
/// (accountRow): where your progress is saved, signing out, and deleting the account.
/// </summary>
public static class AccountView
{
    /// <summary>signin, signup, forgot, reset, or name.</summary>
    public static string Mode = "signin";
    /// <summary>A password-reset link's token (?reset=TOKEN), for choosing a new password.</summary>
    static string resetToken;
    static string email = "", password = "", name, error = "", note = "";
    static bool agreeTerms, agreePrivacy, busy, resetOffered, appleOffered, googleOffered, asked;
    /// <summary>A room to go on into once signed in (an invite link opened before signing in).</summary>
    public static string ThenRoom;

    /// <summary>Whether starting the game asks you to sign in first (everyone plays with an account, where there is a server).</summary>
    public static bool Needed => Net.Available && !(Account.SignedIn && !string.IsNullOrEmpty(Profile.Me.Name));

    /// <summary>A password-reset link's token (?reset=, 64 hex digits) the game was opened with, once (app.ts start).</summary>
    public static string TakeReset()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        var url = Application.absoluteURL ?? "";
        int q = url.IndexOf('?');
        if (q < 0) return null;
        foreach (var part in url.Substring(q + 1).Split('&', '#'))
            if (part.StartsWith("reset="))
            {
                var token = part.Substring(6);
                return System.Text.RegularExpressions.Regex.IsMatch(token, "^[a-f0-9]{64}$") ? token : null;
            }
#endif
        return null;
    }

    /// <summary>Choose a new password, by a reset link's token.</summary>
    public static void Reset(string token)
    {
        resetToken = token;
        Mode = "reset";
        error = note = "";
    }

    /// <summary>The native app (a phone's own build, not the browser's): app.ts isNativeApp.</summary>
#if UNITY_ANDROID || UNITY_IOS
    static bool NativeApp => true;
#else
    static bool NativeApp => false;
#endif

    /// <summary>The page to begin at: signing in, or, signed in without a name, naming yourself.</summary>
    public static void Begin()
    {
        Mode = Account.SignedIn ? "name" : "signin";
        error = note = "";
    }

    public static void Make(RectTransform page, MenuView menu)
    {
        System.Action redraw = () => menu.Show("signin");
        if (!asked && Net.Available)
        {
            // (What the server offers (account.ts serverConfig): a reset email, and Apple's and Google's sign in.)
            asked = true;
            Net.Api("config", "GET", null, r =>
            {
                if (!r.Ok) return;
                resetOffered = (bool?)r.Data["reset"] ?? false;
                appleOffered = r.Data["apple"] != null && r.Data["apple"].Type == Newtonsoft.Json.Linq.JTokenType.String;
                googleOffered = r.Data["google"] != null && r.Data["google"].Type == Newtonsoft.Json.Linq.JTokenType.String;
                if (Mode == "signin" || Mode == "signup") redraw();
            });
        }
        // The form (.signin): one column, 14 between its parts, centred across and in the page above its foot's 12vh
        // (scrolling from the top when it is taller than the page); each part its height and how it is drawn at its top.
        var parts = new System.Collections.Generic.List<(float h, System.Action<RectTransform, float> draw)>();
        float fieldW = Mathf.Min(280, 0.8f * Css.Screen.x), cx = K.W / 2;
        parts.Add((MenuView.TitleMeasures(true).H, (p, y) => MenuView.TitleBlock(p, cx, y, true)));
        // (.menu-heading: clamp(0.9rem, 4vh, 1.3rem), spaced 0.3em, #555a63, on Orbitron's line.)
        float hf = K.Clamp(0.9f * K.Rem, 4 * K.Vh, 1.3f * K.Rem), hh = Line(hf);
        // (A note in the form: .auth-note, ink-soft 11.52, at most 300 across, centred.)
        System.Action<string> quiet = said =>
        {
            float tw = Mathf.Min(300, K.W - 36);
            var probe = K.Fill(page, said, 11.52f, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Top);
            probe.textWrappingMode = TextWrappingModes.Normal;
            float th = probe.GetPreferredValues(said, tw, 0).y;
            parts.Add((th, (p, y) => { probe.transform.SetParent(p, false); Hud.Place(probe.rectTransform, cx - tw / 2, y, tw, th); }));
        };
        System.Action<RectTransform, float, string> heading = (p, y, text) => K.Words(p, text.ToUpperInvariant(), 0, y, K.W, hh, hf, Hud.Rgba(85, 90, 99), true, 500, 0.3f);
        if (Mode == "name")
        {
            float av = K.Clamp(56, 14 * K.Vh, 84);
            if (Account.Current?.Avatar != null) parts.Add((av, (p, y) => MenuView.Avatar(p, cx - av / 2, y, av)));
            parts.Add((hh, (p, y) => heading(p, y, "your name")));
            parts.Add((40, (p, y) => Field(p, name ?? Profile.Me.Name, cx - fieldW / 2, y, fieldW, 40, "your name", false, 18).onValueChanged.AddListener(v => name = v)));
            parts.Add((34, (p, y) => Primary(p, "continue", y, () =>
            {
                // (A name others would see turned down, as the web's signin-go.)
                if (Profane(name ?? Profile.Me.Name))
                {
                    Sound.Play("error");
                    menu.Toast("Pick another name");
                    return;
                }
                Profile.SignIn(name ?? Profile.Me.Name);
                name = null;
                Done(menu);
            })));
        }
        else
        {
            parts.Add((hh, (p, y) => heading(p, y, Mode == "signup" ? "create account" : Mode == "forgot" ? "reset password" : Mode == "reset" ? "new password" : "sign in")));
            // (Apple and Google where the server offers them (.auth-social: fieldW across, 8 apart), then "or"
            // between two hairlines (.auth-or). They sign in on the web game's own page, on this same site: its session
            // is then this game's too, taken up when it is next opened. Not in the native app, as the web's isn't: its
            // web view doesn't allow them.)
            if ((Mode == "signin" || Mode == "signup") && !NativeApp && (appleOffered || googleOffered))
            {
                parts.Add((appleOffered && googleOffered ? 34 + 8 + 34 : 34, (p, y) =>
                {
                    if (appleOffered) Sso(p, cx - fieldW / 2, y, fieldW, false);
                    if (googleOffered) Sso(p, cx - fieldW / 2, appleOffered ? y + 42 : y, fieldW, true);
                }));
                parts.Add((Line(8), (p, y) => Or(p, cx - fieldW / 2, y, fieldW)));
            }
            // (No connection: signing in waits for one.)
            if (Connection.Lost) quiet("Offline. Connect once to sign in; after that, play offline.");
            // (Enter in a box sends the form, as a form's own submit does.)
            System.Action<TMP_InputField, System.Action<string>> keep = (field, set) =>
            {
                field.onValueChanged.AddListener(v => set(v));
                field.onSubmit.AddListener(_ => Submit(menu));
            };
            if (Mode != "reset")
                parts.Add((40, (p, y) => keep(Field(p, email, cx - fieldW / 2, y, fieldW, 40, "email", false, 120), v => email = v)));
            // (What was typed stays through a redraw, as the web's form keeps it: the busy one as it is sent, too.)
            if (Mode != "forgot")
                parts.Add((40, (p, y) => keep(Field(p, password, cx - fieldW / 2, y, fieldW, 40, Mode == "signin" ? "password" : "password (8+ characters)", true, 200), v => password = v)));
            if (Mode == "signup")
                parts.Add((51.3f, (p, y) =>
                {
                    Tick(p, cx - fieldW / 2, y, fieldW, agreeTerms, "I agree to the ", "Terms of Service", "/terms.html", () => { agreeTerms = !agreeTerms; redraw(); });
                    Tick(p, cx - fieldW / 2, y + 27.7f, fieldW, agreePrivacy, "I have read and accept the ", "Privacy Policy", "/privacy.html", () => { agreePrivacy = !agreePrivacy; redraw(); });
                }));
            if (error.Length > 0 || note.Length > 0)
            {
                // (The web's .auth-error, #c0563d 12.48, at most 320 across; or .auth-note, ink-soft 11.52, at most 300.)
                bool bad = error.Length > 0;
                string said = bad ? error : note;
                float size = bad ? 12.48f : 11.52f, tw = Mathf.Min(bad ? 320 : 300, K.W - 36);
                var probe = K.Fill(page, said, size, bad ? Hud.Rgba(192, 86, 61) : Look.InkSoft, false, 400, 0, TextAlignmentOptions.Top);
                probe.textWrappingMode = TextWrappingModes.Normal;
                float th = probe.GetPreferredValues(said, tw, 0).y;
                parts.Add((th, (p, y) => { probe.transform.SetParent(p, false); Hud.Place(probe.rectTransform, cx - tw / 2, y, tw, th); }));
            }
            var action = Mode == "signup" ? "create account" : Mode == "forgot" ? "send link" : Mode == "reset" ? "set password" : "sign in";
            parts.Add((34, (p, y) => Primary(p, busy ? "…" : action, y, () => Submit(menu)).interactable = !busy));
            // (The web's .auth-alt: its links on a line, 18 apart.)
            var links = new System.Collections.Generic.List<(string, System.Action)>();
            if (Mode == "signin")
            {
                links.Add(("new here? create an account", () => { Mode = "signup"; error = note = ""; redraw(); }));
                if (resetOffered) links.Add(("forgot password?", () => { Mode = "forgot"; error = note = ""; redraw(); }));
            }
            else links.Add((Mode == "signup" ? "I have an account: sign in" : "back to sign in", () => { Mode = "signin"; error = note = ""; redraw(); }));
            parts.Add((20, (p, y) => Links(p, y, links)));
        }
        // (The page comes and goes as the web's does: its back, then the form.)
        int mark = page.childCount;
        var back = MenuView.BackButton(page, () => menu.Show("title"), Mathf.Max(18, K.SaL), Mathf.Max(12, K.SaT) + 9);
        menu.PartFrom(mark);
        var backParts = new System.Collections.Generic.List<Transform>();
        for (int i = mark; i < page.childCount; i++) backParts.Add(page.GetChild(i));
        float total = -14;
        foreach (var part in parts) total += part.h + 14;
        float top = Mathf.Max(6, K.SaT), room = K.H - top - 12 * K.Vh;
        RectTransform into = page;
        float at = top + (room - total) / 2;
        // (Taller than its room: the whole form scrolls instead, from just under the top.)
        if (total > room)
        {
            into = K.Scroller(page, "Form", 0, 0, K.W, K.H, total + top + Mathf.Max(12, K.SaB) + 12);
            at = top + 6;
        }
        foreach (var part in parts)
        {
            part.draw(into, at);
            at += part.h + 14;
        }
        // (The form: all the rest.)
        var form = new System.Collections.Generic.List<Transform>();
        foreach (Transform c in page) if (!backParts.Contains(c)) form.Add(c);
        menu.Part(form);
        // (The web's .menu-back: its small back button, calc(max(12px, top) + 9px) down, max(18px, left) in; over the form.)
        back.transform.SetAsLastSibling();
    }

    /// <summary>Signed in and named: on to the hub, or into the room an invite link named.</summary>
    static void Done(MenuView menu)
    {
        if (string.IsNullOrEmpty(Profile.Me.Name) || Profile.Me.SignedIn != true)
        {
            Mode = "name";
            menu.Show("signin");
            return;
        }
        if (ThenRoom != null)
        {
            var room = ThenRoom;
            ThenRoom = null;
            menu.Show("online");
            Online.Go(room);
            return;
        }
        menu.Show("hub");
    }

    /// <summary>The form, sent: sign in, create an account, or ask for a reset email.</summary>
    static void Submit(MenuView menu)
    {
        if (busy) return;
        System.Action redraw = () => menu.Show("signin");
        if (Mode == "signup" && !(agreeTerms && agreePrivacy))
        {
            error = "Agree to the Terms of Service and the Privacy Policy to create an account.";
            redraw();
            return;
        }
        // (What was typed, taken before the form is drawn again busy.)
        string sentEmail = email, sentPassword = password;
        busy = true;
        error = note = "";
        redraw();
        System.Action<Account.AuthResult> done = res =>
        {
            busy = false;
            password = "";
            if (res.Error != null)
            {
                error = res.Error;
                redraw();
                return;
            }
            Done(menu);
        };
        if (Mode == "forgot")
        {
            var to = email;
            Account.RequestReset(to, why =>
            {
                busy = false;
                if (why != null) error = why;
                else note = $"If there's an account for {to}, an email with a link to choose a new password is on its way.";
                redraw();
            });
        }
        else if (Mode == "signup") Account.SignUp(sentEmail, sentPassword, agreeTerms, agreePrivacy, done);
        else if (Mode == "reset") Account.ConfirmReset(resetToken, sentPassword, done);
        else Account.LogIn(sentEmail, sentPassword, done);
    }

    /// <summary>The form's main button (.btn-primary): as wide as its word and padded 16 a side, 34 tall (a line of 10.56 padded 9, and its hairline), centred.</summary>
    static Button Primary(RectTransform page, string text, float y, System.Action act)
    {
        float w = K.BtnW(text, K.Kind.Primary);
        return K.Btn(page, text, act, K.W / 2 - w / 2, y, K.Kind.Primary, w, 34);
    }

    /// <summary>
    /// A line's height as the browser sets a normal line: the font's ascent and descent (Orbitron 1.011 and 0.243 of
    /// its size, Exo 2 0.999 and 0.201), each rounded to a pixel.
    /// </summary>
    static float Line(float size, bool display = true)
        => display ? Mathf.Round(1.011f * size) + Mathf.Round(0.243f * size) : Mathf.Round(0.999f * size) + Mathf.Round(0.201f * size);

    /// <summary>
    /// Continue with Apple or Google (.btn.auth-sso): a button `w` across, 34 tall, its mark (Apple's a black dot 14
    /// across; Google's a bold blue "G", Arial 13) and its words 10 apart, centred.
    /// </summary>
    static void Sso(RectTransform page, float x, float y, float w, bool google)
    {
        string text = google ? "continue with Google" : "continue with Apple";
        var b = K.Btn(page, "", () => Application.OpenURL(Net.Base + "/index.html"), x, y, K.Kind.Btn, w, 34);
        float tw = K.TextW(text.ToUpperInvariant(), 0.66f * K.Rem, 500, 0.14f), left = (w - (14 + 10 + tw)) / 2;
        if (google) K.Words(b.transform, "G", left, 10, 14, 14, 13, Hud.Rgba(66, 133, 244), false, 700);
        else
        {
            var dot = Hud.Box(b.transform, "Mark", Hud.Rgba(17, 17, 17), 7);
            Hud.Place(dot.rectTransform, left, 10, 14, 14);
        }
        K.Words(b.transform, text.ToUpperInvariant(), left + 24, 10, tw + 2, 14, 0.66f * K.Rem, Look.Ink, true, 500, 0.14f, TextAlignmentOptions.Left);
    }

    /// <summary>"or" between two hairlines (.auth-or: Orbitron 8 spaced 0.3em, faint; the lines rgba(150, 160, 185, 0.35), 10 from it).</summary>
    static void Or(RectTransform page, float x, float y, float w)
    {
        float tw = K.TextW("OR", 8, 400, 0.3f), side = (w - tw - 20) / 2, h = Line(8);
        K.Words(page, "OR", x + side + 10, y, tw, h, 8, Look.InkFaint, true, 400, 0.3f, TextAlignmentOptions.Left);
        for (int i = 0; i < 2; i++)
        {
            var line = Hud.Rect(page, "Hairline");
            Hud.Place(line, i == 0 ? x : x + side + 20 + tw, y + h / 2, side, 1);
            var li = line.gameObject.AddComponent<Image>();
            li.color = Hud.Rgba(150, 160, 185, 0.35f);
            li.raycastTarget = false;
        }
    }

    // ---- The profanity filter (engine profanity.ts isProfane), for the name chosen ----

    static readonly string[] BadWords =
    {
        "ass", "arse", "asshole", "arsehole", "bastard", "bollock", "bollocks", "boob", "boobs", "cock", "cum", "cunt", "dick", "dickhead", "dyke",
        "fag", "fags", "fanny", "homo", "hoe", "kike", "nazi", "nonce", "paedo", "pedo", "penis", "piss", "porn", "prick", "rape", "raped", "raping",
        "sex", "sexy", "slag", "slut", "spic", "chink", "coon", "gook", "paki", "tit", "tits", "titties", "tranny", "vagina", "wank", "wanker", "whore",
        "retard", "retarded", "bitch", "shit", "fuck", "twat", "pussy", "jizz", "dildo", "nigga", "nigger", "faggot", "rapist", "hitler", "motherfucker",
    };
    static readonly string[] Spelled = { "fuck", "shit", "nigga", "faggot", "whore", "retard", "hitler", "bitch", "pussy", "twat", "jizz", "dildo", "wanker", "asshole", "arsehole", "motherf" };
    static readonly string[] Allowed = { "scunthorpe", "therapist", "therapists", "shitake", "shiitake", "snigger", "sniggers", "sniggered", "sniggering", "cocktail", "cockpit", "peacock", "hancock", "hitchcock", "shuttlecock", "dickens", "essex", "sussex", "middlesex", "assassin", "assault", "classic", "bassist", "pissarro", "arsenal", "titan", "titanic", "title", "pedometer", "torpedo", "spice", "spicy", "cumin", "cumulus", "document", "homogenous", "homage", "hoes" };
    static readonly string[] Endings = { "", "s", "es", "ed", "er", "ers", "ing", "y", "ies", "head", "face" };
    static readonly System.Text.RegularExpressions.Regex AllowedRe = new System.Text.RegularExpressions.Regex($"(?<!\\p{{L}})(?:{string.Join("|", Allowed)})(?!\\p{{L}})");
    static readonly System.Text.RegularExpressions.Regex Worst = new System.Text.RegularExpressions.Regex("^(fuck|shit|cunt|nigg|fagg|wank|bitch|whor|slut|twat)");
    static readonly System.Text.RegularExpressions.Regex SpelledOut = new System.Text.RegularExpressions.Regex("(?:^|[^\\p{L}])(\\p{L}(?:[^\\p{L}]+\\p{L}(?![\\p{L}])){2,})");
    static readonly System.Text.RegularExpressions.Regex NotLetters = new System.Text.RegularExpressions.Regex("[^\\p{L}]+");
    static readonly System.Text.RegularExpressions.Regex Runs = new System.Text.RegularExpressions.Regex("(\\p{L})\\1+");

    /// <summary>
    /// Whether a name has profanity in it: folded (lower case, accents off, look-alikes read as letters), its words (or
    /// them squeezed) against the list with common endings, letters spelled out one by one read as a word, and the
    /// worst run together.
    /// </summary>
    public static bool Profane(string text)
    {
        var sb = new System.Text.StringBuilder();
        foreach (char ch in (text ?? "").ToLowerInvariant().Normalize(System.Text.NormalizationForm.FormKD))
        {
            if (ch >= '\u0300' && ch <= '\u036f') continue;
            switch (ch)
            {
                case '0': sb.Append('o'); break;
                case '1': case '!': case '|': sb.Append('i'); break;
                case '3': sb.Append('e'); break;
                case '4': case '@': sb.Append('a'); break;
                case '5': case '$': sb.Append('s'); break;
                case '7': case '+': sb.Append('t'); break;
                default: sb.Append(ch); break;
            }
        }
        string folded = AllowedRe.Replace(sb.ToString(), " ");
        var words = NotLetters.Split(folded).Where(w => w.Length > 0).ToList();
        foreach (System.Text.RegularExpressions.Match m in SpelledOut.Matches(folded)) words.Add(NotLetters.Replace(m.Value, ""));
        if (words.Any(BadWord)) return true;
        string letters = NotLetters.Replace(folded, "");
        return new[] { letters, Runs.Replace(letters, "$1") }.Any(l => Spelled.Any(l.Contains));
    }

    static bool BadWord(string word)
    {
        foreach (var w in new[] { word, Runs.Replace(word, "$1") })
        {
            foreach (var end in Endings)
                if (w.EndsWith(end) && System.Array.IndexOf(BadWords, w.Substring(0, w.Length - end.Length)) >= 0) return true;
            if (Worst.IsMatch(w)) return true;
        }
        return false;
    }

    /// <summary>Links on a line, centred, 18 apart (the web's .auth-alt).</summary>
    static void Links(RectTransform page, float y, System.Collections.Generic.List<(string text, System.Action act)> links)
    {
        var widths = new float[links.Count];
        float total = -18;
        for (int i = 0; i < links.Count; i++) total += (widths[i] = K.TextW(links[i].text.ToUpperInvariant(), 9.6f, 400, 0.16f) + 4) + 18;
        float x = K.W / 2 - total / 2;
        for (int i = 0; i < links.Count; i++)
        {
            K.Link(page, links[i].text, links[i].act, x, y);
            x += widths[i] + 18;
        }
    }

    /// <summary>
    /// A box to tick (the web's .auth-tick): its box (13 across, corners 4, a 1.5 line of #b9c0d2; ticked, filled
    /// #5d6a8c) and its words (Exo 2 11.2), the document's name in ink and a tap away; `w` across, 23.7 tall.
    /// </summary>
    static void Tick(RectTransform page, float x, float y, float w, bool on, string text, string docName, string doc, System.Action flip)
    {
        var b = K.Hit(page, text, flip);
        var r = (RectTransform)b.transform;
        Hud.Place(r, x, y, w, 23.7f);
        var edge = Hud.Box(r, "Box", on ? Hud.Rgba(93, 106, 140) : Hud.Rgba(185, 192, 210), 4);
        Hud.Place(edge.rectTransform, 0, 6, 13, 13);
        if (!on)
        {
            var inside = Hud.Box(edge.transform, "Inside", Color.white, 2.5f);
            Hud.Fill(inside.rectTransform);
            inside.rectTransform.offsetMin = new Vector2(1.5f, 1.5f);
            inside.rectTransform.offsetMax = new Vector2(-1.5f, -1.5f);
        }
        else K.Fill(edge.transform, "✓", 9, Color.white, false, 600);
        var words = K.Words(r, $"{text}<color=#3e424a><u>{docName}</u></color>", 22, 4, w - 22, 15.7f, 11.2f, on ? Look.Ink : Look.InkSoft, false, 400, 0, TextAlignmentOptions.Left);
        // (The document's name opens it.)
        float before = words.GetPreferredValues(text).x;
        var read = K.Hit(r, "Read", () => Application.OpenURL(Net.Base + doc), false);
        Hud.Place((RectTransform)read.transform, 22 + before, 0, words.GetPreferredValues(docName).x, 23.7f);
    }

    /// <summary>
    /// A text box (the web's .signin-name): white, a hairline of #e3e6ee, round ends, its words centred in Orbitron
    /// (12.8, spaced 0.12em) inside 16 of padding; placed by its top-left corner. The words typed are kept by
    /// `onValueChanged`.
    /// </summary>
    public static TMP_InputField Field(Transform parent, string text, float x, float y, float w, float h, string placeholder, bool secret, int limit, float size = 12.8f, float em = 0.12f, float pad = 16)
    {
        var box = Hud.Box(parent, "Input", Color.white, h / 2);
        Hud.Place(box.rectTransform, x, y, w, h);
        Hud.Shadow(box, h / 2, new Hud.Drop(Hud.Rgba(227, 230, 238), 0, 0, 1));
        box.raycastTarget = true;
        var area = Hud.Rect(box.transform, "Text Area");
        Hud.Fill(area);
        area.offsetMin = new Vector2(pad, 2);
        area.offsetMax = new Vector2(-pad, -2);
        area.gameObject.AddComponent<RectMask2D>();
        // (The browser's own placeholder grey, #757575.)
        var hint = K.Fill(area, placeholder, size, Hud.Rgba(117, 117, 117), true, 400, em);
        var t = K.Fill(area, text ?? "", size, Look.Ink, true, 400, em);
        t.richText = false;
        var input = box.gameObject.AddComponent<TMP_InputField>();
        input.textViewport = area;
        input.textComponent = t;
        input.placeholder = hint;
        input.characterLimit = limit;
        input.richText = false;
        if (secret) input.contentType = TMP_InputField.ContentType.Password;
        input.text = text ?? "";
        return input;
    }

    // ---- In the profile: the account ----

    static bool deleting;
    static string confirm = "";

    /// <summary>
    /// Under your profile's boxes, from `y` down, `w` across from `x` (app.ts accountRow and the profile's foot), its
    /// rows `gap` apart: the account your progress is saved to (.pv-account: padded 8 by 12, corners 12, an inset
    /// hairline; and deleting it, confirmed with its password), then changing your name and signing out (.pv-foot,
    /// 16 apart); or, signed out, signing in. Returns where it ends.
    /// </summary>
    public static float ProfileRows(Transform card, MenuView menu, System.Action reopen, float x, float y, float w, float gap)
    {
        var a = Account.Current;
        if (a != null)
        {
            var row = K.Inset(card, "Account", new Color(1, 1, 1, 0.7f), Hud.Rgba(150, 160, 185, 0.25f), 12);
            // (Its email (Orbitron 16, a line 20 tall) over its words (Exo 2 9.92, 12), 2 apart, padded 8: 50 tall.)
            Hud.Place(row.rectTransform, x, y, w, 50);
            float dw = deleting ? 0 : K.TextW("DELETE ACCOUNT", 9.6f, 400, 0.16f) + 4;
            var em = K.Words(row.transform, a.Email, 12, 8, w - 24 - dw - 12, Line(16), 16, Look.Ink, true, 500, 0.06f, TextAlignmentOptions.Left);
            Hud.Ellipsis(em);
            K.Words(row.transform, "Your progress is saved to this account.", 12, 8 + Line(16) + 2, w - 24 - dw - 12, Line(9.92f, false), 9.92f, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Left);
            if (!deleting) K.Link(row.transform, "delete account", () => { deleting = true; confirm = ""; error = ""; reopen(); }, w - 12, 25 - (K.LineH(9.6f) + 8) / 2, fromRight: true);
            y += 50 + gap;
            if (deleting)
            {
                // (The web's .pv-delete, 8 between its parts: why (a <small>: Exo 2 13.33, ink-soft), the box to confirm
                // in, what went wrong, and its two buttons (.btn, 34 tall).)
                bool withPassword = a.Password != false;
                string why = $"This deletes your account and all its progress, for good. {(withPassword ? "Enter your password" : "Type DELETE")} to confirm.";
                var wt = K.Words(card, why, x, y, w, 30, 13.33f, Look.InkSoft, false, 400, 0, TextAlignmentOptions.TopLeft);
                wt.textWrappingMode = TextWrappingModes.Normal;
                float wh = wt.GetPreferredValues(why, w, 0).y;
                wt.rectTransform.sizeDelta = new Vector2(w, wh);
                y += wh + 8;
                float fw = Mathf.Min(280, w);
                var field = Field(card, "", x, y, fw, 40, withPassword ? "password" : "DELETE", withPassword, 200);
                field.onValueChanged.AddListener(v => confirm = v);
                y += 40 + 8;
                if (error.Length > 0)
                {
                    K.Words(card, error, x, y, w, 15, 12.48f, Hud.Rgba(192, 86, 61), false, 400, 0, TextAlignmentOptions.Left);
                    y += 15 + 8;
                }
                float cw = K.BtnW("cancel", K.Kind.Btn);
                K.Btn(card, "cancel", () => { deleting = false; error = ""; reopen(); }, x, y, K.Kind.Btn, cw, 34);
                var go = K.Btn(card, "delete account", () =>
                {
                    if (busy) return;
                    busy = true;
                    Account.Delete(confirm, why2 =>
                    {
                        busy = false;
                        if (why2 != null) { error = why2; reopen(); return; }
                        deleting = false;
                        menu.Show("title");
                    });
                }, x + cw + 8, y, K.Kind.Btn, 0, 34);
                go.GetComponentInChildren<TextMeshProUGUI>().color = Hud.Rgba(178, 60, 36);
                go.interactable = !busy;
                y += 34 + gap;
            }
        }
        // The foot (.pv-foot, 16 apart; each link a line of 9.6 padded 4 above and below: 20): changing your name, and
        // signing out.
        float lx = x, ly = y + (20 - (K.LineH(9.6f) + 8)) / 2;
        lx += K.Link(card, "change name", () => { Mode = "name"; menu.Show("signin"); }, lx, ly) + 16;
        K.Link(card, "sign out", () =>
        {
            // Signing out: the account's progress leaves this device with it (it's safe on the server).
            Account.LogOut(() => menu.Show("title"));
        }, lx, ly);
        return y + 20;
    }
}
