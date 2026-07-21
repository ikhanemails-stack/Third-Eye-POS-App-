// Third Eye Computer Solutions - POS System
// Fixes a specific, well-documented WKWebView bug: pages opened through an
// in-app browser (tapping a link shared in WhatsApp, Instagram, etc. opens
// their own built-in browser, not real Safari) sometimes render at the
// correct viewport meta tag's setting - but WebKit doesn't always COMMIT
// to it on the very first paint, so the page loads visually zoomed in
// until something forces a recalculation (which is exactly why pinching
// to zoom out "fixes" it - that gesture forces WebKit to recompute).
//
// This is not something this app's CSS/layout can cause or fix on its
// own - it's a rendering-engine quirk of the host app's embedded browser,
// confirmed by the fact that it renders correctly once manually zoomed.
// The standard workaround: re-apply the exact same viewport meta content
// shortly after load, which forces WebKit to recommit to it - equivalent
// to what the pinch gesture was doing, just automatic.
(function () {
  function recommitViewport() {
    const vp = document.querySelector('meta[name="viewport"]');
    if (!vp) return;
    const content = vp.getAttribute('content');
    // Toggling it off and back on (rather than just re-setting the same
    // string) is what reliably forces WebKit to actually recompute layout
    // in the WebViews known to have this bug - setting the identical value
    // again is sometimes a no-op.
    vp.setAttribute('content', 'width=device-width, initial-scale=1.0');
    // Force a reflow between the two writes.
    void document.body.offsetHeight;
    vp.setAttribute('content', content);
  }

  window.ViewportFix = { recommit: recommitViewport };

  window.addEventListener('load', () => {
    recommitViewport();
    // Some in-app browsers finish "load" before their own chrome/zoom
    // state has settled - a second and third pass shortly after catches
    // those (some Android WebViews settle even later than iOS ones).
    setTimeout(recommitViewport, 300);
    setTimeout(recommitViewport, 1000);
  });

  // Coming back to the tab/app (e.g. switching apps and back, or the
  // in-app browser's own chrome animating in) can re-trigger the same
  // mis-scaled state - recommit whenever the page becomes visible again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') setTimeout(recommitViewport, 150);
  });

  // The very first touch on the page is another reliable moment some
  // WebViews finally commit to the real viewport - cheap to also recommit
  // right before that happens.
  window.addEventListener('touchstart', () => recommitViewport(), { once: true, passive: true });

  // Rotating the phone can trigger the same mis-scaled state in the same
  // WebViews - recommit after orientation changes too.
  window.addEventListener('orientationchange', () => setTimeout(recommitViewport, 300));
})();
