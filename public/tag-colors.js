(function () {
  const PALETTE = [
    { bg: "rgba(255,107,129,0.2)", color: "#ff8fa3", border: "rgba(255,107,129,0.45)", solid: "#ff6b81" },
    { bg: "rgba(255,159,67,0.2)", color: "#ffb366", border: "rgba(255,159,67,0.45)", solid: "#ff9f43" },
    { bg: "rgba(255,206,86,0.2)", color: "#ffe066", border: "rgba(255,206,86,0.45)", solid: "#ffcd39" },
    { bg: "rgba(46,213,115,0.2)", color: "#6ee7a0", border: "rgba(46,213,115,0.45)", solid: "#2ed573" },
    { bg: "rgba(29,209,161,0.2)", color: "#5eead4", border: "rgba(29,209,161,0.45)", solid: "#1dd1a1" },
    { bg: "rgba(72,219,251,0.2)", color: "#7de3ff", border: "rgba(72,219,251,0.45)", solid: "#48dbfb" },
    { bg: "rgba(84,160,255,0.2)", color: "#9ec5ff", border: "rgba(84,160,255,0.45)", solid: "#54a0ff" },
    { bg: "rgba(95,39,205,0.2)", color: "#b197fc", border: "rgba(95,39,205,0.45)", solid: "#5f27cd" },
    { bg: "rgba(162,89,255,0.2)", color: "#c9a0ff", border: "rgba(162,89,255,0.45)", solid: "#a259ff" },
    { bg: "rgba(255,107,197,0.2)", color: "#ff9ed9", border: "rgba(255,107,197,0.45)", solid: "#ff6bc5" },
    { bg: "rgba(255,121,121,0.2)", color: "#ffa8a8", border: "rgba(255,121,121,0.45)", solid: "#ff7979" },
    { bg: "rgba(149,175,192,0.2)", color: "#b8c9d9", border: "rgba(149,175,192,0.45)", solid: "#95afc0" },
  ];

  function hashTag(tag) {
    let h = 0;
    const s = String(tag);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  function getTagColors(tag) {
    return PALETTE[hashTag(tag) % PALETTE.length];
  }

  function styleTagEl(el, tag, { active = false } = {}) {
    const c = getTagColors(tag);
    el.style.borderWidth = "1px";
    el.style.borderStyle = "solid";
    if (active) {
      el.style.background = c.solid;
      el.style.color = "#111";
      el.style.borderColor = c.solid;
    } else {
      el.style.background = c.bg;
      el.style.color = c.color;
      el.style.borderColor = c.border;
    }
  }

  window.TagColors = { getTagColors, styleTagEl };
})();
