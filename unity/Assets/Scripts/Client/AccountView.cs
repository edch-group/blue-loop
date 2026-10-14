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
        var back = Hud.Pill(page, "‹ Back", () => menu.Show("title"), 15);
        Hud.At((RectTransform)back.transform, new Vector2(0, 1), new Vector2(26, -36), new Vector2(110, 44));
        var logo = Hud.Rect(page, "Title");
        Hud.At(logo, new Vector2(0.5f, 1), new Vector2(0, -50), new Vector2(688, 157));
        var li = logo.gameObject.AddComponent<RawImage>();
        li.texture = Resources.Load<Texture2D>("Icons/title");
        li.raycastTarget = false;
        float y = -250;
        if (Mode == "name")
        {
            var avatar = Account.Current?.Avatar;
            if (avatar != null)
            {
                var pic = Hud.Rect(page, "Avatar");
                Hud.At(pic, new Vector2(0.5f, 1), new Vector2(0, y + 20), new Vector2(110, 110));
                var pi = pic.gameObject.AddComponent<RawImage>();
                pi.texture = EngineData.Art(avatar);
                pi.raycastTarget = false;
                y -= 120;
            }
            Heading(page, "your name", y);
            var field = Field(page, name ?? Profile.Me.Name, new Vector2(0, y - 60), new Vector2(420, 56), "your name", false, 18);
            field.onValueChanged.AddListener(v => name = v);
            var go = Hud.Pill(page, "Continue", () =>
            {
                Profile.SignIn(name ?? Profile.Me.Name);
                name = null;
                Done(menu);
            }, 18, Look.Ink, Color.white);
            Hud.At((RectTransform)go.transform, new Vector2(0.5f, 1), new Vector2(0, y - 140), new Vector2(260, 60));
            return;
        }
        Heading(page, Mode == "signup" ? "create account" : Mode == "forgot" ? "reset password" : "sign in", y);
        y -= 60;
        var mail = Field(page, email, new Vector2(0, y), new Vector2(420, 54), "email", false, 120);
        mail.onValueChanged.AddListener(v => email = v);
        y -= 66;
        if (Mode != "forgot")
        {
            var pass = Field(page, "", new Vector2(0, y), new Vector2(420, 54), Mode == "signin" ? "password" : "password (8+ characters)", true, 200);
            password = "";
            pass.onValueChanged.AddListener(v => password = v);
            y -= 66;
        }
        if (Mode == "signup")
        {
            Tick(page, ref y, agreeTerms, "I agree to the Terms of Service", "/terms.html", () => { agreeTerms = !agreeTerms; redraw(); });
            Tick(page, ref y, agreePrivacy, "I have read and accept the Privacy Policy", "/privacy.html", () => { agreePrivacy = !agreePrivacy; redraw(); });
        }
        if (error.Length > 0 || note.Length > 0)
        {
            var said = Hud.Label(page, error.Length > 0 ? error : note, 15, error.Length > 0 ? Look.Danger : Look.InkSoft, false, 500, 0, TextAlignmentOptions.Top);
            said.textWrappingMode = TextWrappingModes.Normal;
            Hud.At(said.rectTransform, new Vector2(0.5f, 1), new Vector2(0, y + 4), new Vector2(460, 50));
            y -= 50;
        }
        var action = Mode == "signup" ? "create account" : Mode == "forgot" ? "send link" : "sign in";
        var submit = Hud.Pill(page, busy ? "…" : action, () => Submit(menu), 18, Look.Ink, Color.white);
        submit.interactable = !busy;
        Hud.At((RectTransform)submit.transform, new Vector2(0.5f, 1), new Vector2(0, y - 6), new Vector2(300, 60));
        y -= 90;
        if (Mode == "signin")
        {
            Link(page, "new here? create an account", y, () => { Mode = "signup"; error = note = ""; redraw(); });
            if (resetOffered) Link(page, "forgot password?", y - 40, () => { Mode = "forgot"; error = note = ""; redraw(); });
        }
        else Link(page, Mode == "signup" ? "I have an account: sign in" : "back to sign in", y, () => { Mode = "signin"; error = note = ""; redraw(); });
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
        else if (Mode == "signup") Account.SignUp(email, password, agreeTerms, agreePrivacy, done);
        else Account.LogIn(email, password, done);
    }

    static void Heading(RectTransform page, string text, float y)
    {
        var h = Hud.Label(page, text.ToUpperInvariant(), 22, Look.Ink, true, 500, 30, TextAlignmentOptions.Top);
        Hud.At(h.rectTransform, new Vector2(0.5f, 1), new Vector2(0, y), new Vector2(600, 40));
    }

    static void Link(RectTransform page, string text, float y, System.Action act)
    {
        var r = Hud.Rect(page, text);
        Hud.At(r, new Vector2(0.5f, 1), new Vector2(0, y), new Vector2(460, 34));
        var hit = r.gameObject.AddComponent<Image>();
        hit.color = new Color(1, 1, 1, 0);
        r.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); act(); });
        Hud.Label(r, text, 15, Look.InkSoft, false, 500, 0);
    }

    /// <summary>A box to tick (agreeing to a document), and the document a tap away.</summary>
    static void Tick(RectTransform page, ref float y, bool on, string text, string doc, System.Action flip)
    {
        var r = Hud.Rect(page, text);
        Hud.At(r, new Vector2(0.5f, 1), new Vector2(0, y), new Vector2(460, 36));
        var hit = r.gameObject.AddComponent<Image>();
        hit.color = new Color(1, 1, 1, 0);
        r.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); flip(); });
        var box = Hud.Rect(r, "Box");
        Hud.At(box, new Vector2(0, 0.5f), Vector2.zero, new Vector2(22, 22));
        var bi = box.gameObject.AddComponent<Image>();
        bi.sprite = Hud.Rounded;
        bi.type = Image.Type.Sliced;
        bi.color = on ? Look.Ink : new Color(0.88f, 0.89f, 0.92f);
        if (on) Hud.Label(box, "✓", 14, Color.white, false, 700, 0);
        var t = Hud.Label(r, text, 14, Look.InkSoft, false, 500, 0, TextAlignmentOptions.Left);
        t.margin = new Vector4(34, 0, 60, 0);
        var read = Hud.Rect(r, "Read");
        Hud.At(read, new Vector2(1, 0.5f), Vector2.zero, new Vector2(56, 30));
        var ri = read.gameObject.AddComponent<Image>();
        ri.color = new Color(1, 1, 1, 0);
        read.gameObject.AddComponent<Button>().onClick.AddListener(() => Application.OpenURL(Net.Base + doc));
        Hud.Label(read, "<u>read</u>", 14, Look.Pick, false, 500, 0, TextAlignmentOptions.Right);
        y -= 42;
    }

    /// <summary>A text box (white, a hairline round it), the words typed kept by `onValueChanged`.</summary>
    public static TMP_InputField Field(Transform parent, string text, Vector2 at, Vector2 size, string placeholder, bool secret, int limit)
    {
        // (The hairline: a slightly larger box drawn just before it.)
        var edge = Hud.Rect(parent, "Edge");
        Hud.At(edge, new Vector2(0.5f, 1), at + new Vector2(0, 1), size + new Vector2(2, 2));
        var ei = edge.gameObject.AddComponent<Image>();
        ei.sprite = Hud.Rounded;
        ei.type = Image.Type.Sliced;
        ei.color = new Color(0.89f, 0.88f, 0.86f);
        ei.raycastTarget = false;
        var box = Hud.Glass(parent, "Input", Color.white, false);
        Hud.At((RectTransform)box.transform, new Vector2(0.5f, 1), at, size);
        var area = Hud.Rect(box.transform, "Text Area");
        Hud.Fill(area);
        area.offsetMin = new Vector2(18, 6);
        area.offsetMax = new Vector2(-18, -6);
        area.gameObject.AddComponent<RectMask2D>();
        var hint = Hud.Label(area, placeholder, 17, Look.InkFaint, false, 400, 0, TextAlignmentOptions.Left);
        var t = Hud.Label(area, text ?? "", 17, Look.Ink, false, 500, 0, TextAlignmentOptions.Left);
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
    /// Under your profile (app.ts accountRow and the profile's foot): the account your progress is saved to (and
    /// deleting it, confirmed with its password), changing your name, and signing out; or, signed out, signing in.
    /// </summary>
    public static void ProfileRows(Transform card, MenuView menu, System.Action reopen)
    {
        var a = Account.Current;
        if (a == null)
        {
            if (!Net.Available) return;
            var signIn = Hud.Pill(card, "Sign in", () => { Begin(); menu.Show("signin"); }, 13);
            Hud.At((RectTransform)signIn.transform, new Vector2(1, 1), new Vector2(-140, -30), new Vector2(120, 40));
            return;
        }
        var who = Hud.Label(card, $"<b>{a.Email}</b>\n<size=85%><color=#737780>Your progress is saved to this account.</color></size>", 15, Look.Ink, false, 500, 0, TextAlignmentOptions.TopLeft);
        who.margin = new Vector4(34, 112, 200, 0);
        bool withPassword = a.Password != false;
        if (!deleting)
        {
            Small(card, "delete account", new Vector2(-34, -116), () => { deleting = true; confirm = ""; error = ""; reopen(); });
            Small(card, "change name", new Vector2(-200, -196), () => { Mode = "name"; menu.Show("signin"); });
            Small(card, "sign out", new Vector2(-34, -196), () =>
            {
                // Signing out: the account's progress leaves this device with it (it's safe on the server).
                Account.LogOut(() => menu.Show("title"));
            });
            return;
        }
        var veil = Hud.Glass(card, "Delete", Color.white);
        Hud.Fill((RectTransform)veil.transform);
        var why = Hud.Label(veil.transform, $"This deletes your account and all its progress, for good. {(withPassword ? "Enter your password" : "Type DELETE")} to confirm.", 15, Look.Ink, false, 500, 0, TextAlignmentOptions.Top);
        why.textWrappingMode = TextWrappingModes.Normal;
        why.margin = new Vector4(40, 40, 40, 0);
        var field = Field(veil.transform, "", new Vector2(0, -120), new Vector2(420, 54), withPassword ? "password" : "DELETE", withPassword, 200);
        field.onValueChanged.AddListener(v => confirm = v);
        if (error.Length > 0)
        {
            var e = Hud.Label(veil.transform, error, 14, Look.Danger, false, 500, 0, TextAlignmentOptions.Top);
            e.margin = new Vector4(40, 186, 40, 0);
        }
        var cancel = Hud.Pill(veil.transform, "Cancel", () => { deleting = false; error = ""; reopen(); }, 14);
        Hud.At((RectTransform)cancel.transform, new Vector2(0.5f, 0), new Vector2(-110, 30), new Vector2(190, 48));
        var go = Hud.Pill(veil.transform, "Delete account", () =>
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
        }, 14, Look.Danger, Color.white);
        Hud.At((RectTransform)go.transform, new Vector2(0.5f, 0), new Vector2(110, 30), new Vector2(190, 48));
    }

    static void Small(Transform card, string text, Vector2 at, System.Action act)
    {
        var r = Hud.Rect(card, text);
        Hud.At(r, new Vector2(1, 1), at, new Vector2(160, 30));
        var hit = r.gameObject.AddComponent<Image>();
        hit.color = new Color(1, 1, 1, 0);
        r.gameObject.AddComponent<Button>().onClick.AddListener(() => { Sound.Play("click"); act(); });
        Hud.Label(r, text, 14, Look.InkSoft, false, 500, 0, TextAlignmentOptions.Right);
    }
}
