// The browser's side of PageLife.cs: the page hidden and shown again (visibilitychange, pagehide, pageshow: sound.ts sleep
// and wake, account.ts's flush), the address bar rewritten without a reload (app.ts history.replaceState), and what the
// game keeps in its data folder written through to the browser's IndexedDB (FS.syncfs), so a reload finds it.
mergeInto(LibraryManager.library, {
  BlueLoopOnPage: function (cb) {
    var call = function (hidden) { {{{ makeDynCall('vi', 'cb') }}}(hidden ? 1 : 0); };
    document.addEventListener('visibilitychange', function () { call(document.visibilityState === 'hidden'); });
    window.addEventListener('pagehide', function () { call(true); });
    window.addEventListener('pageshow', function () { call(document.visibilityState === 'hidden'); });
  },

  BlueLoopReplaceUrl: function (url) {
    try { history.replaceState(null, '', UTF8ToString(url)); } catch (e) { /* not allowed here */ }
  },

  // (One sync at a time; a write made while one runs gets another after it.)
  BlueLoopSyncStore: function () {
    var s = window.__blueLoopSync || (window.__blueLoopSync = { busy: false, again: false });
    if (s.busy) { s.again = true; return; }
    s.busy = true;
    var run = function () {
      FS.syncfs(false, function () {
        if (s.again) { s.again = false; run(); }
        else s.busy = false;
      });
    };
    try { run(); } catch (e) { s.busy = false; }
  },
});
