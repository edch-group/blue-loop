// The browser's side of Safe.cs: the screen's safe area (clear of a phone's notch, rounded corners and home bar), read
// from CSS's env(safe-area-inset-*) on a hidden element, as fractions of the page: "top,right,bottom,left".
mergeInto(LibraryManager.library, {
  BlueLoopSafeInsets: function () {
    var d = document.getElementById('bl-safe');
    if (!d) {
      d = document.createElement('div');
      d.id = 'bl-safe';
      d.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
        'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
      document.body.appendChild(d);
    }
    var s = getComputedStyle(d);
    var w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    var str = [parseFloat(s.paddingTop) / h, parseFloat(s.paddingRight) / w, parseFloat(s.paddingBottom) / h, parseFloat(s.paddingLeft) / w]
      .map(function (v) { return isFinite(v) ? v : 0; }).join(',');
    var size = lengthBytesUTF8(str) + 1;
    var buf = _malloc(size);
    stringToUTF8(str, buf, size);
    return buf;
  },
});
