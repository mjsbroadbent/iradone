/* IradOne Online: shared behaviour on every page.
 *  - the phone menu button
 *  - ad slots: <div class="ad-slot" data-size="leaderboard"></div> shows a
 *    random ad of that size from ads.json, and stays hidden if there is none.
 */
(function () {
  "use strict";

  // Path from this page to the site root, worked out from this script's own URL.
  var me = document.currentScript && document.currentScript.getAttribute("src") || "site.js";
  var base = me.replace(/site\.js(\?.*)?$/, "");

  // ---------- phone menu ----------
  function initMenu() {
    var button = document.querySelector(".nav-toggle");
    var nav = document.getElementById("site-nav");
    if (!button || !nav) return;
    button.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      button.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  // ---------- ad slots ----------
  function initAds() {
    var slots = document.querySelectorAll(".ad-slot[data-size]");
    if (!slots.length) return;
    fetch(base + "ads.json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : { ads: [] }; })
      .then(function (data) {
        var ads = (data.ads || []).filter(function (a) { return a.image && a.active !== false; });
        Array.prototype.forEach.call(slots, function (slot) {
          var pool = ads.filter(function (a) { return a.size === slot.getAttribute("data-size"); });
          if (!pool.length) return;
          var ad = pool[Math.floor(Math.random() * pool.length)];
          var link = document.createElement("a");
          link.href = ad.link ? (/^https?:|^#/.test(ad.link) ? ad.link : base + ad.link) : "#";
          link.className = "ad-link";
          var img = document.createElement("img");
          img.src = base + ad.image;
          img.alt = ad.alt || "Advertisement";
          img.loading = "lazy";
          link.appendChild(img);
          var label = document.createElement("span");
          label.className = "ad-label";
          label.textContent = "Advertisement";
          slot.appendChild(label);
          slot.appendChild(link);
          slot.classList.add("filled");
        });
      })
      .catch(function () { /* no ads */ });
  }

  function init() { initMenu(); initAds(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
