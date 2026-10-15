/* IradOne Online: shared behaviour on every page.
 *  - the phone menu button
 *  - ad slots: <div class="ad-slot" data-size="leaderboard"></div> shows a
 *    random ad of that size from Attelkom Jarnama (plus house ads in ads.json),
 *    and stays hidden if there is none.
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
  // Ads come from Attelkom Jarnama, the national ad network (https://mjsbroadbent.github.io/jarnama/),
  // asking for its "current" and "state" themes. House ads listed in ads.json are mixed in.
  var JARNAMA = "https://mjsbroadbent.github.io/jarnama/";
  var THEMES = ["current", "state"];
  var SIZES = { leaderboard: "728x90", box: "300x250" };

  function getJSON(url) {
    return fetch(url, { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : { ads: [] }; })
      .catch(function () { return { ads: [] }; });
  }

  function initAds() {
    var slots = document.querySelectorAll(".ad-slot[data-size]");
    if (!slots.length) return;
    var today = new Date().toISOString().slice(0, 10);
    Promise.all([getJSON(base + "ads.json"), getJSON(JARNAMA + "campaigns.json")]).then(function (res) {
      var house = (res[0].ads || []).filter(function (a) { return a.image && a.active !== false; })
        .map(function (a) { return { src: base + a.image, alt: a.alt, size: SIZES[a.size] || a.size,
          link: a.link ? (/^https?:|^#/.test(a.link) ? a.link : base + a.link) : "#" }; });
      var network = (res[1].ads || []).filter(function (a) {
        return a.active !== false && /\.(gif|png|jpe?g|webp)$/i.test(a.file) &&
          (a.themes || []).some(function (t) { return THEMES.indexOf(t) >= 0; }) &&
          (!a.start || a.start <= today) && (!a.end || a.end >= today);
      }).map(function (a) { return { src: JARNAMA + a.file, alt: a.alt, size: a.size,
          link: a.link ? (/^https?:/.test(a.link) ? a.link : JARNAMA + a.link) : "#" }; });
      var ads = house.concat(network);
      Array.prototype.forEach.call(slots, function (slot) {
        var want = SIZES[slot.getAttribute("data-size")] || slot.getAttribute("data-size");
        var pool = ads.filter(function (a) { return a.size === want; });
        if (!pool.length) return;
        var ad = pool[Math.floor(Math.random() * pool.length)];
        var link = document.createElement("a");
        link.href = ad.link;
        link.className = "ad-link";
        link.rel = "sponsored noopener";
        link.target = "_blank";
        var img = document.createElement("img");
        img.src = ad.src;
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
    });
  }

  function init() { initMenu(); initAds(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
