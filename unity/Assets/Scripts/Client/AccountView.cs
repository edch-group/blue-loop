using TMPro;
using UnityEngine;
using UnityEngine.UI;
using K = MenuKit;

/// <summary>
/// Signing in (app.ts renderSignIn): to your account with an email and a password, creating one (agreeing to the Terms
/// and the Privacy Policy), or asking for a new password by email; then the name you go by, beside the picture the
/// account was dealt. Also the account's part of your profile (accountRow): where your progress is saved, signing out,
/// and deleting the account.
/// </summary>
public static class AccountView
{
    /// <summary>signin, signup, forgot, or name.</summary>
    public static string Mode = "signin";
    static string email = "", password = "", name, error = "", note = "";
    static bool agreeTerms, agreePrivacy, busy, resetOffered, asked;
    /// <summary>A room to go on into once signed in (an invite link opened before signing in).</summary>
    public static string ThenRoom;

    /// <summary>Whether starting the game asks you to sign in first (everyone plays with an account, where there is a server).</summary>
    public static bool Needed => Net.Available && !(Account.SignedIn && !string.IsNullOrEmpty(Profile.Me.Name));

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
            // (What the server offers: a reset email, or not.)
            asked = true;
            Account.Config(on => { resetOffered = on; if (Mode == "signin") redraw(); });
        }
        // The form (.signin): one column, 14 between its parts, centred across and in the page above its foot's 12vh
        // (scrolling from the top when it is taller than the page); each part its height and how it is drawn at its top.
        var parts = new System.Collections.Generic.List<(float h, System.Action<RectTransform, float> draw)>();
        float fieldW = Mathf.Min(280, 0.8f * Css.Screen.x), cx = K.W / 2;
        parts.Add((MenuView.TitleMeasures(true).H, (p, y) => MenuView.TitleBlock(p, cx, y, true)));
        float hf = K.Clamp(0.9f * K.Rem, 4 * K.Vh, 1.3f * K.Rem), hh = hf * 1.16f;
        System.Action<RectTransform, float, string> heading = (p, y, text) => K.Words(p, text.ToUpperInvariant(), 0, y, K.W, hh, hf, Hud.Rgba(85, 90, 99), true, 500, 0.3f);
        if (Mode == "name")
        {
            float av = K.Clamp(56, 14 * K.Vh, 84);
            if (Account.Current?.Avatar != null) parts.Add((av, (p, y) => MenuView.Avatar(p, cx - av / 2, y, av)));
            parts.Add((hh, (p, y) => heading(p, y, "your name")));
            parts.Add((40, (p, y) => Field(p, name ?? Profile.Me.Name, cx - fieldW / 2, y, fieldW, 40, "your name", false, 18).onValueChanged.AddListener(v => name = v)));
            parts.Add((32, (p, y) => Primary(p, "continue", y, () =>
            {
                Profile.SignIn(name ?? Profile.Me.Name);
                name = null;
                Done(menu);
            })));
        }
        else
        {
            parts.Add((hh, (p, y) => heading(p, y, Mode == "signup" ? "create account" : Mode == "forgot" ? "reset password" : "sign in")));
            parts.Add((40, (p, y) => Field(p, email, cx - fieldW / 2, y, fieldW, 40, "email", false, 120).onValueChanged.AddListener(v => email = v)));
            // (What was typed stays through a redraw, as the web's form keeps it: the busy one as it is sent, too.)
            if (Mode != "forgot")
                parts.Add((40, (p, y) => Field(p, password, cx - fieldW / 2, y, fieldW, 40, Mode == "signin" ? "password" : "password (8+ characters)", true, 200).onValueChanged.AddListener(v => password = v)));
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
            var action = Mode == "signup" ? "create account" : Mode == "forgot" ? "send link" : "sign in";
            parts.Add((32, (p, y) => Primary(p, busy ? "…" : action, y, () => Submit(menu)).interactable = !busy));
            // (The web's .auth-alt: its links on a line, 18 apart.)
            var links = new System.Collections.Generic.List<(string, System.Action)>();
            if (Mode == "signin")
            {
                links.Add(("new here? create an account", () => { Mode = "signup"; error = note = ""; redraw(); }));
                if (resetOffered) links.Add(("forgot password?", () => { Mode = "forgot"; error = note = ""; redraw(); }));
            }
            else links.Add((Mode == "signup" ? "I have an account: sign in" : "back to sign in", () => { Mode = "signin"; error = note = ""; redraw(); }));
            parts.Add((19, (p, y) => Links(p, y, links)));
            // (Apple and Google sign in on the web game's own page, on this same site: its session is then this
            // game's too, taken up when it is next opened. The web game offers them as buttons; here, a link there.)
            if (Mode == "signin" && Net.Available)
                parts.Add((19, (p, y) => Links(p, y, new System.Collections.Generic.List<(string, System.Action)> { ("google or apple? sign in on the web game", () => Application.OpenURL(Net.Base + "/index.html")) })));
        }
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
        // (The web's .menu-back: its small back button, calc(max(12px, top) + 9px) down, max(18px, left) in.)
        MenuView.BackButton(page, () => menu.Show("title"), Mathf.Max(18, K.SaL), Mathf.Max(12, K.SaT) + 9);
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
        else Account.LogIn(sentEmail, sentPassword, done);
    }

    /// <summary>The form's main button (.btn-primary): as wide as its word and padded 16 a side, 32 tall, centred.</summary>
    static Button Primary(RectTransform page, string text, float y, System.Action act)
    {
        float w = K.BtnW(text, K.Kind.Primary);
        return K.Btn(page, text, act, K.W / 2 - w / 2, y, K.Kind.Primary, w);
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
        var hint = K.Fill(area, placeholder, size, Hud.Rgba(138, 141, 147), true, 400, em);
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
            Hud.Place(row.rectTransform, x, y, w, 48);
            float dw = deleting ? 0 : K.TextW("DELETE ACCOUNT", 9.6f, 400, 0.16f) + 4;
            var em = K.Words(row.transform, a.Email, 12, 8, w - 24 - dw - 12, 19, 16, Look.Ink, true, 500, 0.06f, TextAlignmentOptions.Left);
            Hud.Ellipsis(em);
            K.Words(row.transform, "Your progress is saved to this account.", 12, 29, w - 24 - dw - 12, 11, 9.92f, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Left);
            if (!deleting) K.Link(row.transform, "delete account", () => { deleting = true; confirm = ""; error = ""; reopen(); }, w - 12, 14.5f, fromRight: true);
            y += 48 + gap;
            if (deleting)
            {
                // (The web's .pv-delete, 8 between its parts: why, the box to confirm in, what went wrong, and its two buttons.)
                bool withPassword = a.Password != false;
                string why = $"This deletes your account and all its progress, for good. {(withPassword ? "Enter your password" : "Type DELETE")} to confirm.";
                var wt = K.Words(card, why, x, y, w, 30, 10.56f, Look.InkSoft, false, 400, 0, TextAlignmentOptions.TopLeft);
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
                K.Btn(card, "cancel", () => { deleting = false; error = ""; reopen(); }, x, y);
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
                }, x + cw + 8, y);
                go.GetComponentInChildren<TextMeshProUGUI>().color = Hud.Rgba(178, 60, 36);
                go.interactable = !busy;
                y += 32 + gap;
            }
        }
        // The foot: changing your name, and signing out (or, with no account, signing in).
        float lx = x;
        lx += K.Link(card, "change name", () => { Mode = "name"; menu.Show("signin"); }, lx, y) + 16;
        if (a != null)
            K.Link(card, "sign out", () =>
            {
                // Signing out: the account's progress leaves this device with it (it's safe on the server).
                Account.LogOut(() => menu.Show("title"));
            }, lx, y);
        else if (Net.Available) K.Link(card, "sign in", () => { Begin(); menu.Show("signin"); }, lx, y);
        return y + 19;
    }
}
