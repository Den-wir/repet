(() => {
  const $ = (id) => document.getElementById(id);

  const state = {
    page: 1,
    pageSize: 9,
    nameQ: "",
    subjectQ: "",
    minRating: 0,
    minPrice: null,
    maxPrice: null,
    subjectSelect: "",
    selectedSubjects: new Set(),
    subjectMode: "any", // any | all
    sort: "rating_desc",
    theme: "light",
  };

  const els = {
    themeBtn: $("themeBtn"),
    toTop: $("toTop"),
    nameInput: $("nameInput"),
    subjectInput: $("subjectInput"),
    searchBtn: $("searchBtn"),
    subjectSelect: $("subjectSelect"),
    subjectChips: $("subjectChips"),
    minRating: $("minRating"),
    minPrice: $("minPrice"),
    maxPrice: $("maxPrice"),
    sortSelect: $("sortSelect"),
    pageSize: $("pageSize"),
    resetBtn: $("resetBtn"),
    cards: $("cards"),
    status: $("status"),
    prevBtn: $("prevBtn"),
    nextBtn: $("nextBtn"),
    pages: $("pages"),
  };

  const tutors = Array.isArray(window.TUTORS) ? window.TUTORS : [];

  function normalize(s) {
    return String(s || "").toLowerCase().trim();
  }

  function initials(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const a = parts[0]?.[0] || "?";
    const b = parts[1]?.[0] || "";
    return (a + b).toUpperCase();
  }

  function uniqueSubjects() {
    const set = new Set();
    for (const t of tutors) {
      for (const s of t.subjects || []) set.add(s);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }

  function getSubjectMode() {
    const v = document.querySelector('input[name="subjectMode"]:checked')?.value;
    return v === "all" ? "all" : "any";
  }

  function ratingStars(rating) {
    const r = Math.max(0, Math.min(5, Number(rating) || 0));
    const full = Math.floor(r);
    const frac = r - full;
    const half = frac >= 0.25 && frac < 0.75;
    const extraFull = frac >= 0.75 ? 1 : 0;
    const out = [];
    for (let i = 0; i < 5; i++) {
      const idx = i + 1;
      let cls = "star";
      if (idx <= full + extraFull) cls += " star--on";
      else if (idx === full + 1 && half) cls += " star--half";
      out.push(`<span class="${cls}" aria-hidden="true"></span>`);
    }
    return `<span class="stars" aria-label="Рейтинг ${r.toFixed(1)} из 5">${out.join("")}</span>`;
  }

  function renderSubjectsUI() {
    const subjects = uniqueSubjects();

    // Select
    for (const s of subjects) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      els.subjectSelect.appendChild(opt);
    }

    // Chips
    els.subjectChips.innerHTML = subjects
      .map((s) => {
        const id = `sub_${normalize(s).replace(/[^a-zа-я0-9]+/giu, "_")}`;
        return `
          <label class="chip" for="${id}">
            <input id="${id}" type="checkbox" value="${s}" />
            <span>${s}</span>
          </label>
        `;
      })
      .join("");

    els.subjectChips.addEventListener("change", (e) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") return;
      if (input.checked) state.selectedSubjects.add(input.value);
      else state.selectedSubjects.delete(input.value);
      state.page = 1;
      render();
    });
  }

  function applyFilters(items) {
    const nameQ = normalize(state.nameQ);
    const subjQ = normalize(state.subjectQ);
    const minRating = Number(state.minRating) || 0;
    const minPrice = state.minPrice == null || state.minPrice === "" ? null : Number(state.minPrice);
    const maxPrice = state.maxPrice == null || state.maxPrice === "" ? null : Number(state.maxPrice);
    const subjectSelect = state.subjectSelect || "";
    const selected = Array.from(state.selectedSubjects);
    const mode = state.subjectMode;

    return items.filter((t) => {
      const name = normalize(t.name);
      const subjects = (t.subjects || []).map((s) => normalize(s));
      const subjectsText = subjects.join(", ");

      if (nameQ && !name.includes(nameQ)) return false;
      if (subjQ && !subjectsText.includes(subjQ)) return false;

      if (Number(t.rating) < minRating) return false;

      const price = Number(t.price) || 0;
      if (minPrice != null && !Number.isNaN(minPrice) && price < minPrice) return false;
      if (maxPrice != null && !Number.isNaN(maxPrice) && price > maxPrice) return false;

      if (subjectSelect) {
        const sel = normalize(subjectSelect);
        if (!subjects.includes(sel)) return false;
      }

      if (selected.length) {
        const selectedNorm = selected.map(normalize);
        if (mode === "all") {
          for (const s of selectedNorm) if (!subjects.includes(s)) return false;
        } else {
          let ok = false;
          for (const s of selectedNorm) if (subjects.includes(s)) ok = true;
          if (!ok) return false;
        }
      }

      return true;
    });
  }

  function applySort(items) {
    const out = items.slice();
    const [key, dir] = String(state.sort || "rating_desc").split("_");
    const mul = dir === "asc" ? 1 : -1;

    out.sort((a, b) => {
      if (key === "price") return (Number(a.price) - Number(b.price)) * mul;
      if (key === "name") return a.name.localeCompare(b.name, "ru") * mul;
      // rating default
      return (Number(a.rating) - Number(b.rating)) * mul;
    });

    return out;
  }

  function paginate(items) {
    const size = Math.max(1, Number(state.pageSize) || 9);
    const totalPages = Math.max(1, Math.ceil(items.length / size));
    const page = Math.min(Math.max(1, state.page), totalPages);
    state.page = page;
    const start = (page - 1) * size;
    return { page, size, totalPages, slice: items.slice(start, start + size) };
  }

  function renderCards(items) {
    if (!items.length) {
      els.cards.innerHTML = `
        <div class="about" style="grid-column: 1 / -1;">
          <h2 style="margin:0 0 8px;">Ничего не найдено</h2>
          <p class="muted" style="margin:0;">Попробуйте изменить запрос или фильтры.</p>
        </div>
      `;
      return;
    }

    els.cards.innerHTML = items
      .map((t) => {
        const subs = (t.subjects || []).join(", ");
        const edu = t.education ? String(t.education) : "—";
        const exp = Number(t.experienceYears);
        const expText = Number.isFinite(exp) ? `${exp} лет` : "—";
        const rating = Number(t.rating) || 0;
        return `
          <article class="card" aria-label="Карточка репетитора: ${t.name}">
            <div class="card__body">
              <div class="card__top">
                <h3 class="card__name">${t.name}</h3>
                <div class="card__rating">
                  ${ratingStars(rating)}
                  <span class="rating__num">${rating.toFixed(1)}</span>
                </div>
              </div>
              <div class="card__subjects">${subs}</div>
              <p class="card__desc">${t.description || ""}</p>
              <div class="card__meta">
                <span class="tag tag--price">Цена: <strong>${Number(t.price)} ₽</strong></span>
                <span class="tag">Опыт: <strong>${expText}</strong></span>
                <span class="tag tag--edu" title="${edu}">Образование: <strong class="tag__value">${edu}</strong></span>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderPager(totalPages) {
    const maxButtons = 9;
    const page = state.page;
    const pages = [];

    let start = Math.max(1, page - Math.floor(maxButtons / 2));
    let end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);

    for (let p = start; p <= end; p++) pages.push(p);

    els.pages.innerHTML = pages
      .map(
        (p) => `
          <button class="pageBtn" type="button" data-page="${p}" ${p === page ? 'aria-current="page"' : ""}>
            ${p}
          </button>
        `,
      )
      .join("");

    els.prevBtn.disabled = page <= 1;
    els.nextBtn.disabled = page >= totalPages;
  }

  function updateStatus(total, filtered, totalPages) {
    const modeText = state.subjectMode === "all" ? "все" : "хотя бы один";
    const selected = Array.from(state.selectedSubjects);
    const selectedText = selected.length ? ` • предметы: ${selected.join(", ")} (${modeText})` : "";
    els.status.textContent = `Показано: ${filtered} из ${total} • страниц: ${totalPages}${selectedText}`;
  }

  let renderTimer = null;
  function scheduleRender(ms = 150) {
    if (renderTimer) window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => {
      renderTimer = null;
      render();
    }, ms);
  }

  function render() {
    state.subjectMode = getSubjectMode();

    const filtered = applyFilters(tutors);
    const sorted = applySort(filtered);
    const { slice, totalPages } = paginate(sorted);

    renderCards(slice);
    renderPager(totalPages);
    updateStatus(tutors.length, filtered.length, totalPages);
  }

  function syncStateFromUI({ useHeroInputs = true } = {}) {
    if (useHeroInputs) {
      state.nameQ = els.nameInput.value;
      state.subjectQ = els.subjectInput.value;
    }
    state.minRating = els.minRating.value;
    state.minPrice = els.minPrice.value;
    state.maxPrice = els.maxPrice.value;
    state.subjectSelect = els.subjectSelect.value;
    state.sort = els.sortSelect.value;
    state.pageSize = Number(els.pageSize.value) || 9;
  }

  function resetUI() {
    els.nameInput.value = "";
    els.subjectInput.value = "";
    els.subjectSelect.value = "";
    els.minRating.value = "0";
    els.minPrice.value = "";
    els.maxPrice.value = "";
    els.sortSelect.value = "rating_desc";
    els.pageSize.value = "9";
    document.querySelector('input[name="subjectMode"][value="any"]').checked = true;

    state.selectedSubjects.clear();
    els.subjectChips.querySelectorAll('input[type="checkbox"]').forEach((i) => (i.checked = false));
  }

  function applyTheme(next) {
    const theme = next === "dark" ? "dark" : "light";
    state.theme = theme;
    document.documentElement.dataset.theme = theme === "dark" ? "dark" : "";
    if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    els.themeBtn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    try {
      localStorage.setItem("tutor_theme", theme);
    } catch {
      // ignore
    }
  }

  function initTheme() {
    try {
      const saved = localStorage.getItem("tutor_theme");
      if (saved === "dark" || saved === "light") applyTheme(saved);
    } catch {
      // ignore
    }
  }

  function bindEvents() {
    els.searchBtn.addEventListener("click", () => {
      syncStateFromUI({ useHeroInputs: true });
      state.page = 1;
      render();
      document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    // Debounced search typing
    els.nameInput.addEventListener("input", () => {
      state.nameQ = els.nameInput.value;
      state.page = 1;
      scheduleRender(180);
    });
    els.subjectInput.addEventListener("input", () => {
      state.subjectQ = els.subjectInput.value;
      state.page = 1;
      scheduleRender(180);
    });

    els.subjectSelect.addEventListener("change", () => {
      state.subjectSelect = els.subjectSelect.value;
      state.page = 1;
      render();
    });
    els.minRating.addEventListener("input", () => {
      state.minRating = els.minRating.value;
      state.page = 1;
      scheduleRender(120);
    });
    els.minPrice.addEventListener("input", () => {
      state.minPrice = els.minPrice.value;
      state.page = 1;
      scheduleRender(120);
    });
    els.maxPrice.addEventListener("input", () => {
      state.maxPrice = els.maxPrice.value;
      state.page = 1;
      scheduleRender(120);
    });

    document.querySelectorAll('input[name="subjectMode"]').forEach((r) => {
      r.addEventListener("change", () => {
        state.subjectMode = getSubjectMode();
        state.page = 1;
        render();
      });
    });

    els.sortSelect.addEventListener("change", () => {
      state.sort = els.sortSelect.value;
      state.page = 1;
      render();
    });
    els.pageSize.addEventListener("change", () => {
      state.pageSize = Number(els.pageSize.value) || 9;
      state.page = 1;
      render();
    });

    els.prevBtn.addEventListener("click", () => {
      state.page = Math.max(1, state.page - 1);
      render();
      els.cards.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    els.nextBtn.addEventListener("click", () => {
      state.page = state.page + 1;
      render();
      els.cards.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    els.pages.addEventListener("click", (e) => {
      const btn = e.target instanceof Element ? e.target.closest("button[data-page]") : null;
      if (!btn) return;
      const p = Number(btn.getAttribute("data-page"));
      if (!Number.isFinite(p)) return;
      state.page = p;
      render();
      els.cards.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    els.resetBtn.addEventListener("click", () => {
      resetUI();
      syncStateFromUI({ useHeroInputs: true });
      state.page = 1;
      render();
    });

    els.themeBtn.addEventListener("click", () => {
      applyTheme(state.theme === "dark" ? "light" : "dark");
    });

    els.toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function init() {
    initTheme();
    renderSubjectsUI();
    bindEvents();

    // Initial state from UI
    syncStateFromUI({ useHeroInputs: true });
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

