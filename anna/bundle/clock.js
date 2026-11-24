// Listing-capture hook. `?clock=<ISO>` pins Date before the bundle loads,
// so the relative sample dates and a recorded reading agree exactly on any
// day the capture is re-run. Without the query string this file does
// nothing — normal use is untouched.
(function () {
  var m = /[?&]clock=([^&]+)/.exec(window.location.search);
  var t = m && Date.parse(decodeURIComponent(m[1]));
  if (!t) return;
  var R = Date;
  function F() {
    return arguments.length ? new R(...arguments) : new R(t);
  }
  F.now = function () { return t; };
  F.parse = R.parse;
  F.UTC = R.UTC;
  F.prototype = R.prototype;
  window.Date = F;
})();
