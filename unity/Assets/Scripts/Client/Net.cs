using System.Collections;
using System.Collections.Generic;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;
#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#else
using System.Collections.Concurrent;
using System.IO;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
#endif

/// <summary>
/// The game's server (server/worker.ts): where it is, the session that says who you are, its JSON API under /api, and
/// WebSockets into its rooms and its ladder.
///
/// Where: in the browser, the page's own server (the game is served at /play/ on it); elsewhere, the address kept under
/// "blue-loop:server" or put in Resources/server.txt (none: online play and accounts are not offered). The session is
/// the account's token (account.ts keeps the native app's the same way): a Bearer header on the API, `?session=` on a
/// WebSocket, which can't carry headers in a browser.
/// </summary>
public class Net : MonoBehaviour
{
    const string ServerKey = "blue-loop:server", TokenKey = "blue-loop:session";

    /// <summary>The server's address (no trailing slash), or null where there is none.</summary>
    public static string Base
    {
        get
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            try { return new System.Uri(Application.absoluteURL).GetLeftPart(System.UriPartial.Authority); }
            catch { return null; }
#else
            var set = Store.Get(ServerKey) ?? Resources.Load<TextAsset>("server")?.text;
            return string.IsNullOrWhiteSpace(set) ? null : set.Trim().TrimEnd('/');
#endif
        }
    }

    public static bool Available => Base != null;

    /// <summary>The session's token (null: signed out).</summary>
    public static string Token
    {
        get => Store.Read<string>(TokenKey);
        set { if (value == null) Store.Remove(TokenKey); else Store.Write(TokenKey, value); }
    }

    /// <summary>A WebSocket address on the server (ws:// or wss://), with the session on it.</summary>
    public static string Socket(string path)
    {
        var b = Base;
        if (b == null) return null;
        var url = (b.StartsWith("https") ? "wss" : "ws") + b.Substring(b.IndexOf(':')) + path;
        var token = Token;
        return token != null ? $"{url}{(url.Contains("?") ? "&" : "?")}session={token}" : url;
    }

    // ---- The one object that runs it all: requests, timers, sockets ----

    static Net runner;
    static readonly List<NetSocket> sockets = new List<NetSocket>();

    static Net Runner
    {
        get
        {
            if (runner != null) return runner;
            var go = new GameObject("Net");
            DontDestroyOnLoad(go);
            runner = go.AddComponent<Net>();
            return runner;
        }
    }

    void Update()
    {
        // (Each socket's news, handed over here on the main thread; a handler may open or close sockets.)
        foreach (var s in sockets.ToArray()) s.Pump();
    }

    void OnApplicationQuit()
    {
        foreach (var s in sockets.ToArray()) s.Close();
    }

    internal static void Track(NetSocket s)
    {
        _ = Runner;
        sockets.Add(s);
    }

    internal static void Untrack(NetSocket s) => sockets.Remove(s);

    /// <summary>Do something after a while (real seconds). Returns a handle for Cancel.</summary>
    public static Coroutine After(float seconds, System.Action act) => Runner.StartCoroutine(Later(seconds, act));

    public static void Cancel(Coroutine c)
    {
        if (c != null && runner != null) runner.StopCoroutine(c);
    }

    static IEnumerator Later(float seconds, System.Action act)
    {
        yield return new WaitForSecondsRealtime(seconds);
        act();
    }

    // ---- The API ----

    /// <summary>What the server answered: its JSON, or why not (and the status: 0, unreached).</summary>
    public class Reply
    {
        public int Status;
        public JObject Data = new JObject();
        public string Error;
        public bool Ok => Error == null;
    }

    /// <summary>Call the server's API (account.ts api): a path under /api, a method, a body to send as JSON (or null).</summary>
    public static void Api(string path, string method, JObject body, System.Action<Reply> done) => Runner.StartCoroutine(Call(path, method, body, done));

    static IEnumerator Call(string path, string method, JObject body, System.Action<Reply> done)
    {
        var b = Base;
        if (b == null)
        {
            done(new Reply { Error = "Couldn't reach the server. Check your connection." });
            yield break;
        }
        var req = new UnityWebRequest($"{b}/api/{path}", method) { downloadHandler = new DownloadHandlerBuffer() };
        try
        {
            if (body != null)
            {
                req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body.ToString(Formatting.None)));
                req.SetRequestHeader("Content-Type", "application/json");
            }
            var token = Token;
            if (token != null) req.SetRequestHeader("Authorization", "Bearer " + token);
            yield return req.SendWebRequest();
            done(Read(req, b));
        }
        finally
        {
            req.Dispose();
        }
    }

    static Reply Read(UnityWebRequest req, string b)
    {
        int status = (int)req.responseCode;
        if (req.result == UnityWebRequest.Result.ConnectionError || status == 0) return new Reply { Error = "Couldn't reach the server. Check your connection." };
        // (A reply that isn't the account server's JSON: this address has the game's files only, or is the wrong one.)
        var type = "";
        var headers = req.GetResponseHeaders();
        if (headers != null)
            foreach (var kv in headers)
                if (string.Equals(kv.Key, "Content-Type", System.StringComparison.OrdinalIgnoreCase)) type = kv.Value ?? "";
        if (!type.Contains("application/json"))
        {
            string host = b;
            try { host = new System.Uri(b).Host; } catch { }
            return new Reply { Status = status, Error = $"Accounts aren't available at this address ({host}, error {status}). Open the game from its Worker address instead." };
        }
        JObject data;
        try { data = JObject.Parse(req.downloadHandler.text ?? "{}"); }
        catch { data = new JObject(); }
        if (status >= 400) return new Reply { Status = status, Data = data, Error = (string)data["error"] ?? $"Something went wrong (error {status})." };
        return new Reply { Status = status, Data = data };
    }

    // ---- Sharing a link ----

#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] static extern void BlueLoopShare(string url);
#endif

    /// <summary>Hand a link on: the device's share sheet where there is one, else the clipboard.</summary>
    public static void Share(string url)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        BlueLoopShare(url);
#else
        GUIUtility.systemCopyBuffer = url;
#endif
    }
}

/// <summary>
/// A WebSocket: in the browser, the page's own (Plugins/WebGL/BlueLoopNet.jslib); elsewhere .NET's. Its news (opened,
/// a message, closed) arrives on the main thread, in Net's Update.
/// </summary>
public sealed class NetSocket
{
    public System.Action Opened;
    public System.Action<string> Received;
    /// <summary>The connection closed (or never opened). Not called after Close.</summary>
    public System.Action Closed;
    public bool Open { get; private set; }
    bool done;

#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] static extern int BlueLoopSocketOpen(string url);
    [DllImport("__Internal")] static extern void BlueLoopSocketSend(int id, string text);
    [DllImport("__Internal")] static extern void BlueLoopSocketClose(int id);
    [DllImport("__Internal")] static extern string BlueLoopSocketNext(int id);
    readonly int id;

    public NetSocket(string url)
    {
        Net.Track(this);
        id = BlueLoopSocketOpen(url);
    }

    internal void Pump()
    {
        string e;
        while (!done && (e = BlueLoopSocketNext(id)) != null) Deliver(e[0], e.Substring(1));
    }

    public void Send(string text)
    {
        if (Open && !done) BlueLoopSocketSend(id, text);
    }

    public void Close()
    {
        if (done) return;
        done = true;
        Open = false;
        Net.Untrack(this);
        BlueLoopSocketClose(id);
    }
#else
    readonly ConcurrentQueue<(char kind, string text)> news = new ConcurrentQueue<(char, string)>();
    readonly CancellationTokenSource cancel = new CancellationTokenSource();
    ClientWebSocket ws;
    Task sending = Task.CompletedTask;

    public NetSocket(string url)
    {
        Net.Track(this);
        Run(url);
    }

    async void Run(string url)
    {
        try
        {
            ws = new ClientWebSocket();
            await ws.ConnectAsync(new System.Uri(url), cancel.Token);
            news.Enqueue(('o', ""));
            var buffer = new byte[16384];
            var message = new MemoryStream();
            while (ws.State == WebSocketState.Open)
            {
                var r = await ws.ReceiveAsync(new System.ArraySegment<byte>(buffer), cancel.Token);
                if (r.MessageType == WebSocketMessageType.Close) break;
                message.Write(buffer, 0, r.Count);
                if (!r.EndOfMessage) continue;
                news.Enqueue(('m', Encoding.UTF8.GetString(message.ToArray())));
                message.SetLength(0);
            }
        }
        catch
        {
            // Refused, dropped or closed: said below.
        }
        news.Enqueue(('c', ""));
    }

    internal void Pump()
    {
        while (!done && news.TryDequeue(out var e)) Deliver(e.kind, e.text);
    }

    public void Send(string text)
    {
        if (!Open || done) return;
        var bytes = Encoding.UTF8.GetBytes(text);
        var socket = ws;
        // (One send at a time, in order.)
        sending = sending.ContinueWith(_ => socket.State == WebSocketState.Open ? socket.SendAsync(new System.ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, cancel.Token) : Task.CompletedTask).Unwrap();
    }

    public void Close()
    {
        if (done) return;
        done = true;
        Open = false;
        Net.Untrack(this);
        var socket = ws;
        // (What was sent goes first, then the goodbye.)
        sending.ContinueWith(_ =>
        {
            try
            {
                if (socket != null && socket.State == WebSocketState.Open) return socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
            }
            catch
            {
                // Already gone.
            }
            return Task.CompletedTask;
        }).Unwrap().ContinueWith(_ => cancel.Cancel());
    }
#endif

    void Deliver(char kind, string text)
    {
        if (kind == 'o')
        {
            Open = true;
            Opened?.Invoke();
        }
        else if (kind == 'm') Received?.Invoke(text);
        else if (kind == 'c')
        {
            Open = false;
            done = true;
            Net.Untrack(this);
            Closed?.Invoke();
        }
    }
}
