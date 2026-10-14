// The browser's side of Net.cs: WebSockets (.NET's don't work in a page) and sharing a link. Each socket's news waits in
// a queue until the game asks for it (BlueLoopSocketNext, once a frame): "o" opened, "m…" a message, "c" closed.
mergeInto(LibraryManager.library, {
  BlueLoopSocketOpen: function (url) {
    var net = window.__blueLoopNet || (window.__blueLoopNet = { sockets: {}, next: 1 });
    var id = net.next++;
    var s = { queue: [], ws: null };
    net.sockets[id] = s;
    try {
      var ws = new WebSocket(UTF8ToString(url));
      s.ws = ws;
      ws.onopen = function () { s.queue.push('o'); };
      ws.onmessage = function (e) { if (typeof e.data === 'string') s.queue.push('m' + e.data); };
      ws.onclose = function () { s.queue.push('c'); };
    } catch (e) {
      s.queue.push('c');
    }
    return id;
  },

  BlueLoopSocketSend: function (id, text) {
    var net = window.__blueLoopNet;
    var s = net && net.sockets[id];
    if (s && s.ws && s.ws.readyState === 1) s.ws.send(UTF8ToString(text));
  },

  BlueLoopSocketClose: function (id) {
    var net = window.__blueLoopNet;
    var s = net && net.sockets[id];
    if (!s) return;
    delete net.sockets[id];
    try { if (s.ws) s.ws.close(1000); } catch (e) { /* already closed */ }
  },

  BlueLoopSocketNext: function (id) {
    var net = window.__blueLoopNet;
    var s = net && net.sockets[id];
    if (!s || !s.queue.length) return null;
    var str = s.queue.shift();
    if (str === 'c') delete net.sockets[id];
    var size = lengthBytesUTF8(str) + 1;
    var buf = _malloc(size);
    stringToUTF8(str, buf, size);
    return buf;
  },

  BlueLoopShare: function (url) {
    var link = UTF8ToString(url);
    if (navigator.share) navigator.share({ title: 'Blue Loop', url: link }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(link).catch(function () {});
  },
});
