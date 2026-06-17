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

  showAction(msg, actionLabel, onAction, ms = 8000) {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.setAttribute("aria-atomic", "true");
      document.body.appendChild(el);
    }
    el.innerHTML = "";
    const text = document.createElement("span");
    text.textContent = msg;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = actionLabel;
    btn.addEventListener("click", () => {
      clearTimeout(this._timer);
      el.textContent = "";
      onAction();
    });
    el.append(text, " ", btn);
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      el.textContent = "";
    }, ms);
  },
};
