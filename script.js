/* ==========================================================================
   Ahemad Bakali — Portfolio
   Vanilla JS + GSAP/ScrollTrigger + Lenis. Every feature degrades gracefully:
   if a CDN script fails to load, the content is still fully visible and usable.
   ========================================================================== */
(() => {
  "use strict";

  const root = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const TAU = Math.PI * 2;

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const hasGSAP = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";

  const safe = (fn) => {
    try {
      return fn();
    } catch (err) {
      console.warn(err);
    }
  };
  const debounce = (fn, ms = 150) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };
  const store = {
    get: (k) => safe(() => localStorage.getItem(k)),
    set: (k, v) => safe(() => localStorage.setItem(k, v)),
  };

  /* ---------- One shared animation loop ---------- */
  const frameFns = [];
  const onFrame = (fn) => frameFns.push(fn);
  if (hasGSAP) {
    gsap.registerPlugin(ScrollTrigger);
    gsap.ticker.add(() => frameFns.forEach((f) => f()));
  } else {
    (function loop() {
      frameFns.forEach((f) => f());
      requestAnimationFrame(loop);
    })();
  }

  // scroll velocity (px / frame), shared by the marquee and badge
  let lastScrollY = window.scrollY;
  let velocity = 0;
  onFrame(() => {
    const y = window.scrollY;
    velocity = y - lastScrollY;
    lastScrollY = y;
  });

  /* ==========================================================================
     Halftone particle portrait
     ========================================================================== */
  function createPortrait(wrap) {
    const DATA = window.__PORTRAIT__;
    const canvas = wrap && $("canvas", wrap);
    if (!DATA || !canvas) return null;
    const ctx = canvas.getContext("2d");
    const raw = atob(DATA.data);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

    let n = 0, W = 0, H = 0, step = 1;
    let hx, hy, px, py, vx, vy, val, acc, rad, delay, sx, sy;
    const ptr = { x: -1e5, y: -1e5, inside: false };
    const colors = { ink: "#f2f0ea", accent: "#c8ff3d" };
    let light = false;
    let started = false, running = false, visible = true;
    let t0 = 0, scatter = 0, lastScatter = 0, settled = 0;

    function readColors() {
      const cs = getComputedStyle(root);
      colors.ink = cs.getPropertyValue("--ink").trim() || colors.ink;
      colors.accent = cs.getPropertyValue("--accent-text").trim() || colors.accent;
      light = root.dataset.theme === "light";
    }

    // Dot size follows brightness in dark mode and darkness in light mode,
    // so the portrait always reads as a positive image.
    function computeRadii() {
      for (let i = 0; i < n; i++) {
        const t = light ? Math.pow(1 - val[i], 0.7) : Math.pow(val[i], 1.5);
        let r = step * 0.52 * (0.12 + 0.88 * t);
        if (acc[i]) r = Math.max(r, step * 0.36);
        rad[i] = r;
      }
    }

    function build(keepHome) {
      const rect = wrap.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      W = rect.width;
      H = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const stride = W < 300 ? 3 : W < 460 ? 2 : 1;
      const cols = Math.floor(DATA.cols / stride);
      const rows = Math.floor(DATA.rows / stride);
      step = Math.min(W / cols, H / rows);
      const ox = (W - cols * step) / 2;
      const oy = H - rows * step;

      const cells = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const v = bytes[r * stride * DATA.cols + c * stride];
          if (v) cells.push(r, c, v);
        }
      }
      n = cells.length / 3;
      hx = new Float32Array(n); hy = new Float32Array(n);
      px = new Float32Array(n); py = new Float32Array(n);
      vx = new Float32Array(n); vy = new Float32Array(n);
      sx = new Float32Array(n); sy = new Float32Array(n);
      val = new Float32Array(n); rad = new Float32Array(n);
      delay = new Float32Array(n); acc = new Uint8Array(n);

      for (let i = 0; i < n; i++) {
        const r = cells[i * 3], c = cells[i * 3 + 1], v = cells[i * 3 + 2];
        hx[i] = ox + (c + 0.5) * step;
        hy[i] = oy + (r + 0.5) * step;
        acc[i] = v >= 128 ? 1 : 0;
        val[i] = v >= 128 ? (v - 128) / 127 : (v - 1) / 126;
        // where each dot drifts to when the hero dissolves on scroll
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
        const d = (0.2 + Math.random() * 0.95) * H;
        sx[i] = Math.cos(a) * d;
        sy[i] = Math.sin(a) * d - H * 0.12;
        delay[i] = (r / rows) * 0.35 + Math.random() * 0.4;
        if (keepHome) {
          px[i] = hx[i];
          py[i] = hy[i];
        } else {
          px[i] = Math.random() * W * 1.8 - W * 0.4;
          py[i] = Math.random() * H * 1.6 - H * 0.3;
        }
      }
      readColors();
      computeRadii();
      return true;
    }

    function render() {
      const R = Math.max(60, W * 0.17);
      const hotR2 = (R * 0.75) * (R * 0.75);
      const mx = ptr.inside ? ptr.x : -1e5;
      const my = ptr.inside ? ptr.y : -1e5;
      const ink = new Path2D();
      const hot = new Path2D();
      for (let i = 0; i < n; i++) {
        const x = px[i], y = py[i], r = rad[i];
        const dx = x - mx, dy = y - my;
        const p = acc[i] || dx * dx + dy * dy < hotR2 ? hot : ink;
        p.moveTo(x + r, y);
        p.arc(x, y, r, 0, TAU);
      }
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = 1 - scatter * 0.9;
      ctx.fillStyle = colors.ink;
      ctx.fill(ink);
      ctx.fillStyle = colors.accent;
      ctx.fill(hot);
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      if (!running) return;
      const t = (now - t0) / 1000;
      const R = Math.max(60, W * 0.17), R2 = R * R;
      const k = 0.062, fr = 0.84;
      const mx = ptr.inside ? ptr.x : -1e5;
      const my = ptr.inside ? ptr.y : -1e5;
      const sc = scatter;
      let energy = 0;
      for (let i = 0; i < n; i++) {
        if (t > delay[i]) {
          vx[i] += (hx[i] + sx[i] * sc - px[i]) * k;
          vy[i] += (hy[i] + sy[i] * sc - py[i]) * k;
        }
        const dx = px[i] - mx, dy = py[i] - my, d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          const d = Math.sqrt(d2) || 1;
          const f = 1 - d / R;
          vx[i] += (dx / d) * f * f * 4.2;
          vy[i] += (dy / d) * f * f * 4.2;
        }
        vx[i] *= fr;
        vy[i] *= fr;
        px[i] += vx[i];
        py[i] += vy[i];
        energy += Math.abs(vx[i]) + Math.abs(vy[i]);
      }
      render();

      // sleep when nothing is moving: saves battery
      const introDone = t > 2.6;
      if (introDone && !ptr.inside && energy / n < 0.004 && sc === lastScatter) settled++;
      else settled = 0;
      lastScatter = sc;
      if (settled > 20) {
        running = false;
        return;
      }
      requestAnimationFrame(frame);
    }

    function wake() {
      if (!started || running || !visible) return;
      running = true;
      settled = 0;
      requestAnimationFrame(frame);
    }

    function burst(x, y) {
      for (let i = 0; i < n; i++) {
        const dx = px[i] - x, dy = py[i] - y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = 34 * Math.exp(-d / (W * 0.32)) * (0.5 + Math.random());
        vx[i] += (dx / d) * f;
        vy[i] += (dy / d) * f;
      }
      wake();
    }

    build(false);

    new ResizeObserver(
      debounce(() => {
        if (build(started) && started) {
          render();
          wake();
        }
      }, 120)
    ).observe(wrap);

    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) wake();
      else running = false;
    }).observe(wrap);

    if (!reduceMotion) {
      const hero = wrap.closest(".hero") || wrap;
      hero.addEventListener(
        "pointermove",
        (e) => {
          const r = canvas.getBoundingClientRect();
          const R = Math.max(60, W * 0.17);
          ptr.x = e.clientX - r.left;
          ptr.y = e.clientY - r.top;
          ptr.inside = ptr.x > -R && ptr.x < W + R && ptr.y > -R && ptr.y < H + R;
          if (ptr.inside) wake();
        },
        { passive: true }
      );
      hero.addEventListener("pointerleave", () => (ptr.inside = false));
      hero.addEventListener("pointerdown", (e) => {
        if (e.target.closest("a, button")) return;
        const r = canvas.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        if (x > 0 && x < W && y > 0 && y < H) burst(x, y);
      });
    }

    return {
      intro(instant) {
        started = true;
        t0 = performance.now();
        if (instant || reduceMotion) {
          for (let i = 0; i < n; i++) {
            px[i] = hx[i];
            py[i] = hy[i];
          }
          render();
          return;
        }
        wake();
      },
      setScatter(v) {
        scatter = v;
        wake();
      },
      recolor() {
        readColors();
        computeRadii();
        if (started) render();
      },
    };
  }

  /* ==========================================================================
     Theme (circular reveal with the View Transitions API)
     ========================================================================== */
  let portrait = null;

  function setTheme(next) {
    root.dataset.theme = next;
    store.set("theme", next);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "light" ? "#efede7" : "#0b0b0c");
    if (portrait) portrait.recolor();
  }

  function initTheme() {
    const btn = $("#themeToggle");
    if (!btn) return;
    btn.addEventListener("click", (e) => {
      const next = root.dataset.theme === "light" ? "dark" : "light";
      if (!document.startViewTransition || reduceMotion) return setTheme(next);
      const r = btn.getBoundingClientRect();
      const x = e.clientX || r.left + r.width / 2;
      const y = e.clientY || r.top + r.height / 2;
      const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const vt = document.startViewTransition(() => setTheme(next));
      vt.ready.then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 900, easing: "cubic-bezier(.7,0,.3,1)", pseudoElement: "::view-transition-new(root)" }
        );
      });
    });
  }

  /* ==========================================================================
     Smooth scroll + anchor links
     ========================================================================== */
  let lenis = null;

  function initSmoothScroll() {
    if (window.Lenis && !reduceMotion) {
      lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
      if (hasGSAP) {
        lenis.on("scroll", ScrollTrigger.update);
        gsap.ticker.add((time) => lenis.raf(time * 1000));
        gsap.ticker.lagSmoothing(0);
      } else {
        const raf = (t) => {
          lenis.raf(t);
          requestAnimationFrame(raf);
        };
        requestAnimationFrame(raf);
      }
    }

    document.addEventListener("click", (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href");
      const target = id === "#top" || id === "#" ? 0 : $(id);
      if (target === null) return;
      e.preventDefault();
      if (document.body.classList.contains("menu-open")) setMenu(false);
      scrollToTarget(target);
      if (target !== 0) {
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      }
    });
  }

  function scrollToTarget(target) {
    if (lenis) {
      lenis.scrollTo(target, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
    } else if (target === 0) {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    } else {
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    }
  }

  /* ==========================================================================
     Navigation: hide on scroll down, active section, progress bar
     ========================================================================== */
  function initNav() {
    const nav = $("#nav");
    const bar = $(".progress span");
    let lastY = window.scrollY;
    const update = () => {
      const y = window.scrollY;
      nav.classList.toggle("nav--scrolled", y > 40);
      if (y > lastY + 4 && y > 200) nav.classList.add("nav--hidden");
      else if (y < lastY - 4 || y < 200) nav.classList.remove("nav--hidden");
      lastY = y;
      const max = document.documentElement.scrollHeight - innerHeight;
      if (bar) bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    };
    addEventListener("scroll", update, { passive: true });
    update();

    const links = $$("[data-nav]");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          links.forEach((l) => l.classList.toggle("is-active", l.dataset.nav === en.target.id));
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    ["about", "services", "work", "contact"].forEach((id) => {
      const s = document.getElementById(id);
      if (s) io.observe(s);
    });
    const hero = $("#hero");
    if (hero) {
      new IntersectionObserver(
        ([en]) => en.isIntersecting && links.forEach((l) => l.classList.remove("is-active")),
        { rootMargin: "-45% 0px -50% 0px" }
      ).observe(hero);
    }
  }

  /* ---------- Mobile menu ---------- */
  function setMenu(open) {
    const btn = $("#menuToggle");
    const menu = $("#menu");
    document.body.classList.toggle("menu-open", open);
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    menu.setAttribute("aria-hidden", String(!open));
    menu.inert = !open;
    if (lenis) open ? lenis.stop() : lenis.start();
    else document.body.style.overflow = open ? "hidden" : "";
  }

  function initMenu() {
    const btn = $("#menuToggle");
    const menu = $("#menu");
    if (!btn || !menu) return;
    menu.inert = true;
    btn.addEventListener("click", () => setMenu(!document.body.classList.contains("menu-open")));
    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.body.classList.contains("menu-open")) setMenu(false);
    });
    matchMedia("(min-width: 901px)").addEventListener("change", (e) => e.matches && setMenu(false));
  }

  /* ==========================================================================
     Cursor, magnetic elements, scramble text, spotlight cards
     ========================================================================== */
  function initCursor() {
    if (!finePointer) return;
    const cur = $(".cursor");
    const ring = $(".cursor__ring");
    const dot = $(".cursor__dot");
    if (!cur) return;
    root.classList.add("has-cursor");
    cur.classList.add("cursor--hidden");
    let mx = -100, my = -100, rx = -100, ry = -100, seen = false;

    addEventListener(
      "pointermove",
      (e) => {
        mx = e.clientX;
        my = e.clientY;
        dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
        if (!seen) {
          rx = mx;
          ry = my;
          seen = true;
          cur.classList.remove("cursor--hidden");
        }
      },
      { passive: true }
    );
    onFrame(() => {
      rx += (mx - rx) * 0.2;
      ry += (my - ry) * 0.2;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    });

    let state = "";
    const setState = (s) => {
      if (s === state) return;
      if (state) cur.classList.remove(`cursor--${state}`);
      if (s) cur.classList.add(`cursor--${s}`);
      state = s;
    };
    document.addEventListener("pointerover", (e) => {
      const t = e.target.closest("[data-cursor], a, button, input, textarea, label");
      if (!t) return setState("");
      if (t.matches("input, textarea")) return setState("text");
      setState(t.dataset.cursor || "link");
    });
    document.addEventListener("pointerdown", () => cur.classList.add("cursor--down"));
    document.addEventListener("pointerup", () => cur.classList.remove("cursor--down"));
    document.addEventListener("pointerleave", () => cur.classList.add("cursor--hidden"));
    document.addEventListener("pointerenter", () => cur.classList.remove("cursor--hidden"));
  }

  function initMagnetic() {
    if (!finePointer || !hasGSAP || reduceMotion) return;
    $$("[data-magnetic]").forEach((el) => {
      const s = parseFloat(el.dataset.magnetic) || 0.3;
      const xTo = gsap.quickTo(el, "x", { duration: 0.9, ease: "elastic.out(1, 0.4)" });
      const yTo = gsap.quickTo(el, "y", { duration: 0.9, ease: "elastic.out(1, 0.4)" });
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * s);
        yTo((e.clientY - r.top - r.height / 2) * s);
      });
      el.addEventListener("pointerleave", () => {
        xTo(0);
        yTo(0);
      });
    });
  }

  function initScramble() {
    const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>";
    $$("[data-scramble]").forEach((el) => {
      const node = [...el.childNodes].find((c) => c.nodeType === 3 && c.textContent.trim());
      if (!node) return;
      const final = node.textContent;
      let raf = 0;
      el.addEventListener("mouseenter", () => {
        cancelAnimationFrame(raf);
        let frame = 0;
        const run = () => {
          let out = "";
          for (let i = 0; i < final.length; i++) {
            out += i < frame / 2.5 ? final[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
          }
          node.textContent = out;
          if (frame++ < final.length * 2.5) raf = requestAnimationFrame(run);
          else node.textContent = final;
        };
        run();
      });
    });
  }

  function initSpotlight() {
    $$("[data-spotlight]").forEach((c) => {
      c.addEventListener("pointermove", (e) => {
        const r = c.getBoundingClientRect();
        c.style.setProperty("--mx", `${e.clientX - r.left}px`);
        c.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    });
  }

  function initTilt() {
    if (!finePointer || reduceMotion) return;
    $$(".project__link").forEach((link) => {
      const media = $(".project__media", link);
      link.addEventListener("pointermove", (e) => {
        const r = media.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        media.style.transform = `rotateY(${x * 9}deg) rotateX(${-y * 9}deg)`;
      });
      link.addEventListener("pointerleave", () => (media.style.transform = ""));
    });
  }

  /* ---------- Hero: rotating words, glow, clock ---------- */
  function initRotator() {
    const words = $$(".rotator > span");
    if (words.length < 2 || reduceMotion) return;
    let i = 0;
    setInterval(() => {
      const cur = words[i];
      i = (i + 1) % words.length;
      cur.classList.remove("is-active");
      cur.classList.add("is-leaving");
      words[i].classList.add("is-active");
      setTimeout(() => {
        cur.style.transition = "none";
        cur.classList.remove("is-leaving");
        void cur.offsetWidth;
        cur.style.transition = "";
      }, 950);
    }, 2600);
  }

  function initGlow() {
    const hero = $("#hero");
    const glow = $(".hero__glow");
    if (!hero || !glow || !finePointer) return;
    hero.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      glow.style.setProperty("--gx", `${(e.clientX - r.width * 0.7) * 0.12}px`);
      glow.style.setProperty("--gy", `${(e.clientY - r.top - r.height * 0.4) * 0.12}px`);
    });
  }

  function initClock() {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const els = $$("#clock, #clock2");
    const tick = () => {
      const s = fmt.format(new Date());
      els.forEach((el) => (el.textContent = s));
    };
    tick();
    setInterval(tick, 10000);
    $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
  }

  /* ==========================================================================
     Text splitting
     ========================================================================== */
  // Wraps every word in a masked span (keeps <em> and other inline tags).
  function splitWords(el) {
    const words = [];
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) return frag.appendChild(document.createTextNode(" "));
            const outer = document.createElement("span");
            const inner = document.createElement("span");
            outer.className = "w";
            inner.className = "wi";
            inner.textContent = part;
            outer.appendChild(inner);
            frag.appendChild(outer);
            words.push(inner);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName !== "BR") {
          walk(child);
        }
      });
    };
    walk(el);
    return words;
  }

  function splitPlain(el) {
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = "";
    return words.map((w, i) => {
      const s = document.createElement("span");
      s.className = "sw";
      s.textContent = w;
      el.appendChild(s);
      if (i < words.length - 1) el.appendChild(document.createTextNode(" "));
      return s;
    });
  }

  /* ==========================================================================
     Preloader -> hero intro
     ========================================================================== */
  function runIntro() {
    const loader = $("#loader");
    if (!hasGSAP || reduceMotion || !loader) {
      if (loader) loader.remove();
      if (portrait) portrait.intro(reduceMotion);
      return;
    }
    loader.style.animation = "none";
    $$(".loader__line", loader).forEach((line) => {
      line.innerHTML = [...line.textContent].map((ch) => `<span class="ch">${ch}</span>`).join("");
    });

    const heroBits = ".hero__meta > *, .hero__hello, .hero__sub, .hero__ctas > *, .hero__scroll, .hero__hint";
    gsap.set(".hero__title .word", { yPercent: 115, rotate: 5 });
    gsap.set(heroBits, { opacity: 0, y: 24 });
    if (lenis) lenis.stop();

    const count = $("#loaderCount");
    const counter = { v: 0 };
    const intro = gsap.timeline();
    intro
      .from(".loader__line .ch", { yPercent: 115, duration: 1.1, ease: "expo.out", stagger: 0.035 })
      .to(counter, {
        v: 100,
        duration: 1.7,
        ease: "power3.inOut",
        onUpdate: () => (count.textContent = Math.round(counter.v)),
      }, 0)
      .to(".loader__bar span", { scaleX: 1, duration: 1.7, ease: "power3.inOut" }, 0);

    const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    const fontsOrTimeout = Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]);
    const introDone = new Promise((r) => intro.eventCallback("onComplete", r));

    Promise.all([fontsOrTimeout, introDone]).then(() => {
      const out = gsap.timeline({
        onComplete: () => {
          loader.remove();
          if (lenis) lenis.start();
          ScrollTrigger.refresh();
        },
      });
      out
        .to(".loader__line .ch", { yPercent: -115, duration: 0.6, ease: "power3.in", stagger: 0.02 })
        .to(".loader__foot, .loader__bar", { opacity: 0, duration: 0.3 }, "<")
        .to(".loader__accent", { scaleY: 1, duration: 0.7, ease: "expo.inOut" }, "-=0.25")
        .to(loader, { clipPath: "inset(0% 0% 100% 0%)", duration: 1.05, ease: "expo.inOut" }, "-=0.1")
        .add(() => portrait && portrait.intro(), "-=0.75")
        .to(".hero__title .word", { yPercent: 0, rotate: 0, duration: 1.5, ease: "expo.out", stagger: 0.12 }, "-=0.65")
        .to(heroBits, { opacity: 1, y: 0, duration: 1.1, ease: "expo.out", stagger: 0.05 }, "-=1.2");
    });
  }

  /* ==========================================================================
     Scroll-driven animations
     ========================================================================== */
  function initScrollAnimations() {
    if (!hasGSAP) return;

    // counters show two digits
    $$("[data-count]").forEach((el) => (el.textContent = String(el.dataset.count).padStart(2, "0")));
    if (reduceMotion) return;

    // Pinned section first: triggers created after it account for its pin spacing.
    // horizontal gallery on desktop
    const mm = gsap.matchMedia();
    mm.add("(min-width: 1024px)", () => {
      root.classList.add("has-hscroll");
      const pin = $(".work__pin");
      const track = $(".work__track");
      const bar = $(".work__bar i");
      const idx = $("#workIndex");
      const total = $$(".project", track).length;
      const dist = () => track.scrollWidth - innerWidth;

      const tween = gsap.to(track, {
        x: () => -dist(),
        ease: "none",
        scrollTrigger: {
          trigger: pin,
          start: "top top",
          end: () => `+=${dist()}`,
          pin: true,
          scrub: 0.8,
          invalidateOnRefresh: true,
          anticipatePin: 1,
          onUpdate: (self) => {
            if (bar) bar.style.transform = `scaleX(${self.progress})`;
            if (idx) idx.textContent = String(clamp(Math.round(self.progress * (total - 1)) + 1, 1, total)).padStart(2, "0");
          },
        },
      });

      $$(".project", track).forEach((card) => {
        const img = $(".project__media img", card);
        gsap.fromTo(
          img,
          { xPercent: -4 },
          {
            xPercent: 4,
            ease: "none",
            scrollTrigger: { trigger: card, containerAnimation: tween, start: "left right", end: "right left", scrub: true },
          }
        );
      });

      return () => root.classList.remove("has-hscroll");
    });

    // hero dissolves into particles as you scroll away
    gsap.to(".hero__content", {
      yPercent: -14,
      opacity: 0.15,
      ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
    });
    ScrollTrigger.create({
      trigger: ".hero",
      start: "top top",
      end: "bottom top",
      onUpdate: (self) => portrait && portrait.setScatter(Math.pow(self.progress, 1.3)),
    });

    // masked word reveals for headings
    $$("[data-split]").forEach((el) => {
      const words = splitWords(el);
      gsap.from(words, {
        yPercent: 115,
        rotate: 4,
        duration: 1.25,
        ease: "expo.out",
        stagger: 0.07,
        scrollTrigger: { trigger: el, start: "top 88%" },
      });
    });

    $$("[data-reveal]").forEach((el) => {
      gsap.from(el, {
        y: 56,
        opacity: 0,
        duration: 1.2,
        ease: "expo.out",
        scrollTrigger: { trigger: el, start: "top 92%" },
      });
    });

    // about statement lights up word by word
    const statement = $("[data-words]");
    if (statement) {
      const words = splitPlain(statement);
      gsap.fromTo(
        words,
        { opacity: 0.14 },
        {
          opacity: 1,
          ease: "none",
          stagger: 0.1,
          scrollTrigger: { trigger: statement, start: "top 82%", end: "bottom 48%", scrub: true },
        }
      );
    }

    $$("[data-count]").forEach((el) => {
      const o = { v: 0 };
      const end = +el.dataset.count;
      el.textContent = "00";
      gsap.to(o, {
        v: end,
        duration: 2.2,
        ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 92%" },
        onUpdate: () => (el.textContent = String(Math.round(o.v)).padStart(2, "0")),
      });
    });

    // about photo: curtain reveal that settles on the full, uncropped photo
    const frame = $(".about__photo-frame");
    if (frame) {
      gsap
        .timeline({ scrollTrigger: { trigger: frame, start: "top 82%" } })
        .fromTo(
          frame,
          { clipPath: "inset(100% 0% 0% 0% round 18px)" },
          { clipPath: "inset(0% 0% 0% 0% round 18px)", duration: 1.6, ease: "expo.inOut" }
        )
        .fromTo($("img", frame), { scale: 1.2 }, { scale: 1, duration: 2, ease: "expo.out" }, 0.2);
    }

    // badge spins, faster while scrolling
    const badgeText = $(".badge text");
    const badgeSpin = badgeText
      ? gsap.to(badgeText, { rotation: 360, svgOrigin: "100 100", duration: 14, repeat: -1, ease: "none" })
      : null;

    // marquee tapes react to scroll speed & direction
    const tapes = $(".tapes");
    const anims = $$(".tape__inner")
      .map((el) => el.getAnimations && el.getAnimations()[0])
      .filter(Boolean);
    let rate = 1, dir = 1, skew = 0;
    onFrame(() => {
      if (velocity > 0.5) dir = 1;
      else if (velocity < -0.5) dir = -1;
      const target = dir * (1 + Math.min(Math.abs(velocity) * 0.12, 5));
      rate += (target - rate) * 0.08;
      anims.forEach((a) => (a.updatePlaybackRate ? a.updatePlaybackRate(rate) : (a.playbackRate = rate)));
      skew += (clamp(-velocity * 0.25, -7, 7) - skew) * 0.1;
      if (tapes) tapes.style.setProperty("--skew", `${skew.toFixed(2)}deg`);
      if (badgeSpin) badgeSpin.timeScale(1 + Math.min(Math.abs(velocity) * 0.2, 6));
    });

    addEventListener("load", () => ScrollTrigger.refresh());
  }

  /* ---------- Client list: floating preview ---------- */
  function initPreview() {
    if (!finePointer) return;
    const box = $(".preview");
    const rows = $$(".clients__list a");
    if (!box || !rows.length) return;
    const imgs = $$("img", box);
    let x = innerWidth / 2, y = innerHeight / 2, tx = x, ty = y, off = 40, on = false, raf = 0;

    const loop = () => {
      x += (tx - x) * 0.14;
      y += (ty - y) * 0.14;
      const w = box.offsetWidth;
      const targetOff = tx > innerWidth * 0.55 ? -w - 40 : 40;
      off += (targetOff - off) * 0.12;
      const rot = clamp((tx - x) * 0.05, -10, 10);
      box.style.transform = `translate3d(${x + off}px, ${y}px, 0) translateY(-50%) rotate(${rot}deg)`;
      raf = on || Math.abs(tx - x) > 0.5 ? requestAnimationFrame(loop) : 0;
    };

    rows.forEach((a) => {
      a.addEventListener("pointerenter", (e) => {
        const i = +a.dataset.preview;
        imgs.forEach((im, j) => im.classList.toggle("is-active", j === i));
        if (!on && !box.classList.contains("is-visible")) {
          x = tx = e.clientX;
          y = ty = e.clientY;
        }
        on = true;
        box.classList.add("is-visible");
        if (!raf) raf = requestAnimationFrame(loop);
      });
      a.addEventListener("pointerleave", () => {
        on = false;
        box.classList.remove("is-visible");
      });
    });
    addEventListener(
      "pointermove",
      (e) => {
        tx = e.clientX;
        ty = e.clientY;
      },
      { passive: true }
    );
  }

  /* ---------- Contact: copy email, AJAX form, toast ---------- */
  let toastTimer = 0;
  function toast(msg) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-visible"), 2600);
  }

  function initContact() {
    const copy = $("#copyEmail");
    if (copy) {
      copy.addEventListener("click", async () => {
        const email = copy.dataset.email;
        try {
          await navigator.clipboard.writeText(email);
          toast("Email copied to clipboard ✓");
        } catch {
          location.href = `mailto:${email}`;
        }
      });
    }

    const form = $("#contactForm");
    const status = $("#formStatus");
    if (!form || !window.fetch) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) return form.reportValidity();
      status.className = "form__status mono";
      status.textContent = "Sending…";
      form.classList.add("is-sending");
      try {
        const res = await fetch(form.action, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(Object.fromEntries(new FormData(form))),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) throw new Error(json.message || "Request failed");
        form.reset();
        status.classList.add("is-ok");
        status.textContent = "Thanks! Your message is on its way.";
        toast("Message sent ✓");
      } catch (err) {
        status.classList.add("is-error");
        status.textContent = "Couldn't send. Please email me directly.";
      } finally {
        form.classList.remove("is-sending");
      }
    });
  }

  /* ---------- Footer: fit-to-width name with variable-weight hover ---------- */
  function initFooter() {
    const big = $("#footerBig");
    if (!big) return;
    // each word becomes a block on phones so the name can stack on two lines
    const words = big.textContent.trim().split(/\s+/);
    big.textContent = "";
    const letters = [];
    words.forEach((word, wi) => {
      const w = document.createElement("span");
      w.className = "fw";
      [...word].forEach((ch) => {
        const s = document.createElement("span");
        s.className = "fl";
        s.textContent = ch;
        w.appendChild(s);
        letters.push(s);
      });
      big.appendChild(w);
      if (wi < words.length - 1) {
        const sp = document.createElement("span");
        sp.className = "fsp";
        sp.textContent = "\u00A0";
        big.appendChild(sp);
      }
    });

    const fit = () => {
      big.style.fontSize = "100px";
      const w = big.getBoundingClientRect().width;
      const avail = big.parentElement.clientWidth;
      if (w) big.style.fontSize = `${(100 * avail) / w}px`;
      if (hasGSAP) ScrollTrigger.refresh();
    };
    fit();
    if (document.fonts) document.fonts.ready.then(fit);
    addEventListener("resize", debounce(fit, 200));

    if (!finePointer || reduceMotion) return;
    const footer = big.closest("footer");
    const weights = letters.map(() => 800);
    let targets = letters.map(() => 800);
    let centers = [];
    let raf = 0;
    const loop = () => {
      let moving = false;
      letters.forEach((l, i) => {
        weights[i] += (targets[i] - weights[i]) * 0.14;
        if (Math.abs(targets[i] - weights[i]) > 0.5) moving = true;
        l.style.fontWeight = Math.round(weights[i]);
        l.style.color = weights[i] < 700 ? "var(--accent-text)" : "";
      });
      raf = moving ? requestAnimationFrame(loop) : 0;
    };
    footer.addEventListener("pointerenter", () => {
      centers = letters.map((l) => {
        const r = l.getBoundingClientRect();
        return r.left + r.width / 2;
      });
    });
    footer.addEventListener("pointermove", (e) => {
      targets = centers.map((c) => 800 - 420 * Math.max(0, 1 - Math.abs(e.clientX - c) / 260));
      if (!raf) raf = requestAnimationFrame(loop);
    });
    footer.addEventListener("pointerleave", () => {
      targets = letters.map(() => 800);
      if (!raf) raf = requestAnimationFrame(loop);
    });
  }

  /* ==========================================================================
     Boot
     ========================================================================== */
  portrait = safe(() => createPortrait($("#portrait")));
  [
    initTheme,
    initClock,
    initSmoothScroll,
    initNav,
    initMenu,
    initCursor,
    initMagnetic,
    initScramble,
    initSpotlight,
    initTilt,
    initRotator,
    initGlow,
    initPreview,
    initContact,
    initFooter,
    initScrollAnimations,
  ].forEach(safe);

  try {
    runIntro();
  } catch (err) {
    console.warn(err);
    const loader = $("#loader");
    if (loader) loader.remove();
    if (portrait) portrait.intro(true);
  }

  console.log(
    "%cHey there, fellow developer 👋%c\nLike what you see? Let's build something together → ahemadbakali26@gmail.com",
    "font: 700 16px system-ui; color: #c8ff3d; background: #0b0b0c; padding: 6px 10px; border-radius: 6px;",
    "font: 13px system-ui; color: inherit;"
  );
})();
