using TMPro;
using UnityEngine;
using UnityEngine.UI;

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
        // (The web's .menu-back: its small back button, 30.4 down.)
        MenuView.BackButton(page, () => menu.Show("title"), 26.1f, 30.4f);
        // The form (the web's .signin): one column, 20.3 between its parts, centred on 444 down; each part its height
        // and how it is drawn at its top.
        var parts = new System.Collections.Generic.List<(float h, System.Action<float> draw)>();
        // (The small title block: its words' top 150.3 under the block's.)
        parts.Add((150.3f, y => menu.TitleBlock(page, y + 124.6f, 390)));
        if (Mode == "name")
        {
            if (Account.Current?.Avatar != null) parts.Add((121.8f, y => MenuView.Avatar(page, 800 - 60.9f, y, 121.8f)));
            parts.Add((37, y => Heading(page, "your name", y)));
            parts.Add((58, y => Field(page, name ?? Profile.Me.Name, 597, y, 406, 58, "your name", false, 18).onValueChanged.AddListener(v => name = v)));
            parts.Add((47.1f, y => Primary(page, "continue", y, () =>
            {
                Profile.SignIn(name ?? Profile.Me.Name);
                name = null;
                Done(menu);
            })));
        }
        else
        {
            parts.Add((37, y => Heading(page, Mode == "signup" ? "create account" : Mode == "forgot" ? "reset password" : "sign in", y)));
            parts.Add((58, y => Field(page, email, 597, y, 406, 58, "email", false, 120).onValueChanged.AddListener(v => email = v)));
            // (What was typed stays through a redraw, as the web's form keeps it: the busy one as it is sent, too.)
            if (Mode != "forgot")
                parts.Add((58, y => Field(page, password, 597, y, 406, 58, Mode == "signin" ? "password" : "password (8+ characters)", true, 200).onValueChanged.AddListener(v => password = v)));
            if (Mode == "signup")
                parts.Add((74.4f, y =>
                {
                    Tick(page, y, agreeTerms, "I agree to the ", "Terms of Service", "/terms.html", () => { agreeTerms = !agreeTerms; redraw(); });
                    Tick(page, y + 40.1f, agreePrivacy, "I have read and accept the ", "Privacy Policy", "/privacy.html", () => { agreePrivacy = !agreePrivacy; redraw(); });
                }));
            if (error.Length > 0 || note.Length > 0)
            {
                // (The web's .auth-error, #c0563d, or .auth-note, ink-soft: centred, wrapped within 464 or 435.)
                bool bad = error.Length > 0;
                string said = bad ? error : note;
                var probe = Hud.Label(page, said, bad ? 18.1f : 16.7f, bad ? Hud.Rgba(192, 86, 61) : Look.InkSoft, false, 400, 0, TextAlignmentOptions.Top);
                probe.textWrappingMode = TextWrappingModes.Normal;
                float tw = bad ? 464 : 435, th = probe.GetPreferredValues(said, tw, 0).y;
                parts.Add((th, y => Hud.Place(probe.rectTransform, 800 - tw / 2, y, tw, th)));
            }
            var action = Mode == "signup" ? "create account" : Mode == "forgot" ? "send link" : "sign in";
            parts.Add((47.1f, y => Primary(page, busy ? "…" : action, y, () => Submit(menu)).interactable = !busy));
            // (The web's .auth-alt: its links on a line, 26.1 apart.)
            var links = new System.Collections.Generic.List<(string, System.Action)>();
            if (Mode == "signin")
            {
                links.Add(("new here? create an account", () => { Mode = "signup"; error = note = ""; redraw(); }));
                if (resetOffered) links.Add(("forgot password?", () => { Mode = "forgot"; error = note = ""; redraw(); }));
            }
            else links.Add((Mode == "signup" ? "I have an account: sign in" : "back to sign in", () => { Mode = "signin"; error = note = ""; redraw(); }));
            parts.Add((28.6f, y => Links(page, y, links)));
            // (Apple and Google sign in on the web game's own page, on this same site: its session is then this
            // game's too, taken up when it is next opened. The web game offers them as buttons; here, a link there.)
            if (Mode == "signin" && Net.Available)
                parts.Add((28.6f, y => Links(page, y, new System.Collections.Generic.List<(string, System.Action)> { ("google or apple? sign in on the web game", () => Application.OpenURL(Net.Base + "/index.html")) })));
        }
        float total = -20.3f;
        foreach (var part in parts) total += part.h + 20.3f;
        float at = 444.35f - total / 2;
        foreach (var part in parts)
        {
            part.draw(at);
            at += part.h + 20.3f;
        }
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

    /// <summary>The form's heading (the web's .menu-heading): 30.2, spaced 0.3em, #555a63, centred.</summary>
    static void Heading(RectTransform page, string text, float y) =>
        Hud.Text(page, text.ToUpperInvariant(), 0, y, 1600, 37, 30.2f, Hud.Rgba(85, 90, 99), true, 500, 30);

    /// <summary>The form's main button (.btn-primary): as wide as its word and 23.2 either side, 47.1 tall, centred.</summary>
    static Button Primary(RectTransform page, string text, float y, System.Action act)
    {
        float w = Hud.Wide(text.ToUpperInvariant(), 15.3f, 700, 14, 24.6f);
        var b = Hud.Primary(page, text, act);
        Hud.Place((RectTransform)b.transform, 800 - w / 2, y, w, 47.1f);
        return b;
    }

    /// <summary>Links on a line, centred, 26.1 apart (the web's .auth-alt).</summary>
    static void Links(RectTransform page, float y, System.Collections.Generic.List<(string text, System.Action act)> links)
    {
        var widths = new float[links.Count];
        float total = -26.1f;
        for (int i = 0; i < links.Count; i++) total += (widths[i] = Hud.Wide(links[i].text.ToUpperInvariant(), 13.9f, 400, 16, 2.9f)) + 26.1f;
        float x = 800 - total / 2;
        for (int i = 0; i < links.Count; i++)
        {
            var b = Hud.Link(page, links[i].text, links[i].act);
            Hud.Place((RectTransform)b.transform, x, y, widths[i], 28.6f);
            x += widths[i] + 26.1f;
        }
    }

    /// <summary>
    /// A box to tick (the web's .auth-tick): its box (18.9 across, corners 5.8, a 2.2 line of #b9c0d2; ticked, filled
    /// #5d6a8c) and its words (Exo 2, 16.2), the document's name in ink and a tap away; 406 across, centred.
    /// </summary>
    static void Tick(RectTransform page, float y, bool on, string text, string docName, string doc, System.Action flip)
    {
        var r = Hud.Rect(page, text);
        Hud.Place(r, 597, y, 406, 34.3f);
        var hit = r.gameObject.AddComponent<Image>();
        hit.color = new Color(1, 1, 1, 0);
        r.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); flip(); });
        var edge = Hud.Box(r, "Box", on ? Hud.Rgba(93, 106, 140) : Hud.Rgba(185, 192, 210), 5.8f);
        Hud.Place((RectTransform)edge.transform, 0, 8.7f, 18.9f, 18.9f);
        if (!on)
        {
            var inside = Hud.Box(edge.transform, "Inside", Color.white, 3.6f);
            Hud.Fill((RectTransform)inside.transform);
            ((RectTransform)inside.transform).offsetMin = new Vector2(2.2f, 2.2f);
            ((RectTransform)inside.transform).offsetMax = new Vector2(-2.2f, -2.2f);
        }
        else Hud.Label(edge.transform, "✓", 13, Color.white, false, 600, 0);
        var words = Hud.Text(r, $"{text}<color=#3e424a><u>{docName}</u></color>", 18.9f + 13, 0, 406 - 32, 34.3f, 16.2f, on ? Look.Ink : Look.InkSoft, false, 400, 0, TextAlignmentOptions.Left);
        words.textWrappingMode = TextWrappingModes.Normal;
        // (The document's name opens it.)
        var read = Hud.Rect(r, "Read");
        float before = words.GetPreferredValues(text).x;
        Hud.Place(read, 31.9f + before, 0, words.GetPreferredValues(docName).x, 34.3f);
        var ri = read.gameObject.AddComponent<Image>();
        ri.color = new Color(1, 1, 1, 0);
        read.gameObject.AddComponent<Button>().onClick.AddListener(() => Application.OpenURL(Net.Base + doc));
    }

    /// <summary>
    /// A text box (the web's .signin-name): white, a hairline of #e3e6ee, round ends, its words centred in Orbitron
    /// (18.6, spaced 0.12em); placed by its top-left corner. The words typed are kept by `onValueChanged`.
    /// </summary>
    public static TMP_InputField Field(Transform parent, string text, float x, float y, float w, float h, string placeholder, bool secret, int limit, float size = 18.6f)
    {
        var box = Hud.Box(parent, "Input", Color.white, h / 2);
        Hud.Place((RectTransform)box.transform, x, y, w, h);
        Hud.Shadow(box, h / 2, new Hud.Drop(Hud.Rgba(227, 230, 238), 0, 0, 1));
        box.raycastTarget = true;
        var area = Hud.Rect(box.transform, "Text Area");
        Hud.Fill(area);
        area.offsetMin = new Vector2(23.2f, 4);
        area.offsetMax = new Vector2(-23.2f, -4);
        area.gameObject.AddComponent<RectMask2D>();
        var hint = Hud.Label(area, placeholder, size, Hud.Rgba(138, 141, 147), true, 400, 12);
        var t = Hud.Label(area, text ?? "", size, Look.Ink, true, 400, 12);
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
    /// Under your profile's boxes, from `y` down (app.ts accountRow and the profile's foot): the account your progress
    /// is saved to (and deleting it, confirmed with its password), then changing your name and signing out; or, signed
    /// out, signing in. Returns the card's whole height.
    /// </summary>
    public static float ProfileRows(Transform card, MenuView menu, System.Action reopen, float y)
    {
        var a = Account.Current;
        if (a != null)
        {
            // (The web's .pv-account: 746.2 by 72.1, corners 17.4, an inset hairline; the address and its line left,
            // delete account right.)
            var row = Hud.Box(card, "Account", Hud.Rgba(150, 160, 185, 0.25f), 17.4f);
            Hud.Place((RectTransform)row.transform, 32.9f, y, 746.2f, 72.1f);
            var inside = Hud.Box(row.transform, "Inside", Color.white, 16);
            Hud.Fill((RectTransform)inside.transform);
            ((RectTransform)inside.transform).offsetMin = new Vector2(1.4f, 1.4f);
            ((RectTransform)inside.transform).offsetMax = new Vector2(-1.4f, -1.4f);
            Hud.Text(row.transform, a.Email, 17.4f, 11.6f, 500, 29, 23.2f, Look.Ink, true, 500, 6, TextAlignmentOptions.Left);
            Hud.Text(row.transform, "Your progress is saved to this account.", 17.4f, 43.5f, 500, 17, 14.4f, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Left);
            if (!deleting)
                FootLink(row.transform, "delete account", 728.8f, 21.7f, true, () => { deleting = true; confirm = ""; error = ""; reopen(); });
            y += 72.1f + 20.3f;
            if (deleting)
            {
                // (The web's .pv-delete: why, the box to confirm in, what went wrong, and its two buttons.)
                bool withPassword = a.Password != false;
                var why = Hud.Text(card, $"This deletes your account and all its progress, for good. {(withPassword ? "Enter your password" : "Type DELETE")} to confirm.", 32.9f, y, 746.2f, 20, 15.3f, Look.InkSoft, false, 400, 0, TextAlignmentOptions.Left);
                why.textWrappingMode = TextWrappingModes.Normal;
                y += 20 + 11.6f;
                var field = Field(card, "", 32.9f, y, 406, 58, withPassword ? "password" : "DELETE", withPassword, 200);
                field.onValueChanged.AddListener(v => confirm = v);
                y += 58 + 11.6f;
                if (error.Length > 0)
                {
                    Hud.Text(card, error, 32.9f, y, 746.2f, 20, 15.3f, Hud.Rgba(192, 86, 61), false, 400, 0, TextAlignmentOptions.Left);
                    y += 20 + 11.6f;
                }
                float cw = Hud.Wide("CANCEL", 15.3f, 500, 14, 24.2f), dw = Hud.Wide("DELETE ACCOUNT", 15.3f, 500, 14, 24.2f);
                var cancel = Hud.Btn(card, "Cancel", () => { deleting = false; error = ""; reopen(); }, 15.3f);
                Hud.Place((RectTransform)cancel.transform, 32.9f, y, cw, 47.1f);
                var go = Hud.Btn(card, "Delete account", () =>
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
                }, 15.3f);
                Hud.Place((RectTransform)go.transform, 32.9f + cw + 11.6f, y, dw, 47.1f);
                go.GetComponentInChildren<TextMeshProUGUI>().color = Hud.Rgba(178, 60, 36);
                go.interactable = !busy;
                y += 47.1f + 20.3f;
            }
        }
        // The foot: changing your name, and signing out (or, with no account, signing in).
        float x = 32.9f;
        x += FootLink(card, "change name", x, y, false, () => { Mode = "name"; menu.Show("signin"); }) + 23.2f;
        if (a != null)
            FootLink(card, "sign out", x, y, false, () =>
            {
                // Signing out: the account's progress leaves this device with it (it's safe on the server).
                Account.LogOut(() => menu.Show("title"));
            });
        else if (Net.Available) FootLink(card, "sign in", x, y, false, () => { Begin(); menu.Show("signin"); });
        return y + 28.6f + 29.9f;
    }

    /// <summary>A link (the web's .link-btn, 28.6 tall) at (x, y), or with its right edge at x; returns its width.</summary>
    static float FootLink(Transform parent, string text, float x, float y, bool fromRight, System.Action act)
    {
        float w = Hud.Wide(text.ToUpperInvariant(), 13.9f, 400, 16, 2.9f);
        var b = Hud.Link(parent, text, act);
        Hud.Place((RectTransform)b.transform, fromRight ? x - w : x, y, w, 28.6f);
        return w;
    }
}
