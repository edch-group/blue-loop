// The browser's side of Connection.cs and the hub's fullscreen button (app.ts isOffline, fullscreenButton).
mergeInto(LibraryManager.library, {
  // Whether the browser has a connection (navigator.onLine), and a count of its comings and goings: the window's
  // online and offline events, listened for once.
  BlueLoopOnline: function () {
    if (!window.blOnlineHooked) {
      window.blOnlineHooked = true;
      window.blOnlineChanges = 0;
      var bump = function () { window.blOnlineChanges++; };
      window.addEventListener('online', bump);
      window.addEventListener('offline', bump);
    }
    return navigator.onLine === false ? 0 : 1;
  },

  BlueLoopOnlineChanges: function () {
    return window.blOnlineChanges || 0;
  },

  // Fullscreen: whether the page is, and whether a button for it is offered (where the browser allows it, and not in
  // an installed app, which has no browser bars to hide; while fullscreen, always, to leave it).
  BlueLoopFullscreenOn: function () {
    return (document.fullscreenElement || document.webkitFullscreenElement) ? 1 : 0;
  },

  BlueLoopFullscreenOffered: function () {
    var on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    var installed = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    return on || ((document.fullscreenEnabled || document.webkitFullscreenEnabled) && !installed) ? 1 : 0;
  },
});
