window.Toast = {
  show(msg, ms = 3000) {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.setAttribute("aria-atomic", "true");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    if (msg) {
      clearTimeout(this._timer);
      this._timer = setTimeout(() => {
        if (el.textContent === msg) el.textContent = "";
      }, ms);
    }
  },
};
