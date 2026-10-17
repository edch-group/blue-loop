// The browser's side of Sound.cs's scores: played by the page (window.blueLoopMusic, WebGLTemplates/Fill) on the game's
// own audio context, so they go through the same master and limiter, sleep with it, and loop on the exact sample.
mergeInto(LibraryManager.library, {
  BlueLoopMusicStart: function (scene, reversed, fadeIn) {
    if (!window.blueLoopMusic || !WEBAudio.audioContext) return;
    window.blueLoopMusic.start(WEBAudio.audioContext, UTF8ToString(scene), reversed != 0, fadeIn);
  },

  BlueLoopMusicStop: function (now) {
    if (window.blueLoopMusic && WEBAudio.audioContext) window.blueLoopMusic.stop(WEBAudio.audioContext, now != 0);
  },

  BlueLoopMusicTime: function () {
    return window.blueLoopMusic && WEBAudio.audioContext ? window.blueLoopMusic.time(WEBAudio.audioContext) : -1;
  },
});
