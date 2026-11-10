const $ = (s) => document.querySelector(s);
const SESSION = { am: "아침", pm: "저녁" };
let current = null;
let activeTab = null;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function getJson(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

function fmt(n, digits) {
  const d = digits ?? (Math.abs(n) >= 1000 ? 2 : 2);
  return n.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function spark(values, cls) {
  if (!values || values.length < 2) return "";
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(2)},${(28 - ((v - min) / span) * 26).toFixed(2)}`).join(" ");
  return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6" vector-effect="non-scaling-stroke" class="${cls}"/></svg>`;
}

function renderMarkets(groups) {
  $("#markets").innerHTML = groups.map((g) => `
    <h2 class="group-title">${esc(g.group)}</h2>
    <div class="grid">
      ${g.items.map((q) => {
        if (q.error) return `<div class="quote"><div class="name">${esc(q.name)}</div><div class="price flat">—</div><div class="chg flat">불러오지 못함</div></div>`;
        const cls = q.change > 0 ? "up" : q.change < 0 ? "down" : "flat";
        const arrow = q.change > 0 ? "▲" : q.change < 0 ? "▼" : "–";
        const unit = q.unit === "$" ? "$" : "";
        const suffix = q.unit === "%" ? "%" : "";
        return `<a class="quote" href="#/s/${encodeURIComponent(q.symbol)}">
          <div class="name">${esc(q.name)}</div>
          <div class="price">${unit}${fmt(q.price, q.digits)}${suffix}</div>
          <div class="chg ${cls}">${arrow} ${fmt(Math.abs(q.change), q.digits)} (${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%)</div>
          <div class="${cls}">${spark(q.spark, cls)}</div>
        </a>`;
      }).join("")}
    </div>`).join("");
}

function renderAI(ai) {
  const box = $("#ai");
  if (!ai) { box.hidden = true; return; }
  box.hidden = false;
  $("#ai-headline").textContent = ai.headline ?? "";
  $("#ai-points").innerHTML = (ai.points ?? []).map((p) => `<li>${esc(p)}</li>`).join("");
  $("#ai-watch-wrap").hidden = !(ai.watch?.length);
  $("#ai-watch").innerHTML = (ai.watch ?? []).map((p) => `<li>${esc(p)}</li>`).join("");
}

function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function renderNews(news) {
  const cats = Object.keys(news ?? {});
  if (!cats.includes(activeTab)) activeTab = cats[0];
  $("#news-tabs").innerHTML = cats.map((c) =>
    `<button class="tab" role="tab" aria-selected="${c === activeTab}" data-cat="${esc(c)}">${esc(c)} <span class="muted small">${news[c].length}</span></button>`).join("");
  const list = news?.[activeTab] ?? [];
  $("#news").innerHTML = list.length
    ? list.map((n) => `<li>
        <a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>
        <div class="meta">${esc(n.source)} · ${esc(timeAgo(n.published))}</div>
      </li>`).join("")
    : `<li class="muted">뉴스가 없어요.</li>`;
}

function render(b) {
  current = b;
  const gen = new Date(b.generatedAt).toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  $("#stamp").textContent = `${b.date} ${SESSION[b.session] ?? ""} 브리핑 · ${gen} 업데이트`;
  document.querySelector(".banner")?.remove();
  if (b.mock) $("main").insertAdjacentHTML("afterbegin", `<div class="banner">샘플 데이터예요. GitHub Actions가 처음 실행되면 실제 데이터로 바뀝니다.</div>`);
  renderAI(b.ai);
  renderMarkets(b.markets ?? []);
  renderNews(b.news);
}

$("#news-tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  activeTab = btn.dataset.cat;
  renderNews(current.news);
});

$("#archive").addEventListener("change", async (e) => {
  const id = e.target.value;
  try { render(await getJson(id === "latest" ? "data/latest.json" : `data/archive/${id}.json`)); window.scrollTo(0, 0); }
  catch { alert("지난 브리핑을 불러오지 못했어요."); }
});

// ================= 종목 상세 =================
const RANGES = [["1D", "1일"], ["1W", "1주"], ["1M", "1개월"], ["3M", "3개월"], ["1Y", "1년"]];
let detail = null;
let range = "1D";
let homeScroll = 0;

const symbolFile = (s) => s.replace(/[^A-Za-z0-9]/g, "_") + ".json";
const priceText = (q, v) => `${q.unit === "$" ? "$" : ""}${fmt(v, q.digits)}${q.unit === "%" ? "%" : ""}`;
const dirCls = (d) => (d > 0 ? "up" : d < 0 ? "down" : "flat");
const arrowOf = (d) => (d > 0 ? "▲" : d < 0 ? "▼" : "–");

function volText(v) {
  if (v == null || !v) return "—";
  if (v >= 1e8) return (v / 1e8).toFixed(2) + "억";
  if (v >= 1e4) return Math.round(v / 1e4).toLocaleString("ko-KR") + "만";
  return v.toLocaleString("ko-KR");
}

function whenText(t, r) {
  const d = new Date(t);
  if (r === "1D" || r === "1W") return d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "numeric", day: "numeric" });
}

function baselineOf(pts) {
  return range === "1D" ? detail.prev : pts[0]?.[1];
}

function setHeader(value, base, label) {
  const diff = value - base;
  $("#d-price").textContent = priceText(detail, value);
  const c = $("#d-chg");
  c.className = "dchg " + dirCls(diff);
  c.textContent = `${arrowOf(diff)} ${fmt(Math.abs(diff), detail.digits)} (${diff >= 0 ? "+" : ""}${((diff / base) * 100).toFixed(2)}%)`;
  $("#d-when").textContent = label;
}

function resetHeader() {
  const pts = detail.charts[range] ?? [];
  const base = baselineOf(pts) ?? detail.prev;
  const label = range === "1D" ? "전일 대비" : `${RANGES.find((r) => r[0] === range)[1]} 전 대비`;
  setHeader(detail.price, base, label);
}

function drawChart() {
  const svg = $("#chart");
  const pts = detail.charts[range] ?? [];
  const W = svg.clientWidth || 360, H = 220, PAD = 14;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  $("#d-empty").hidden = pts.length > 1;
  if (pts.length < 2) { svg.innerHTML = ""; return; }

  const base = baselineOf(pts);
  const vals = pts.map((p) => p[1]).concat(range === "1D" && base ? [base] : []);
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const x = (i) => (i / (pts.length - 1)) * W;
  const y = (v) => PAD + (1 - (v - min) / span) * (H - PAD * 2);
  const cls = dirCls(detail.price - base);
  svg.setAttribute("class", "chart " + cls);
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const hi = pts.reduce((a, p, i) => (p[1] > pts[a][1] ? i : a), 0);
  const lo = pts.reduce((a, p, i) => (p[1] < pts[a][1] ? i : a), 0);
  const tag = (i, above) => {
    const tx = Math.min(Math.max(x(i), 30), W - 30);
    return `<text x="${tx}" y="${y(pts[i][1]) + (above ? -6 : 14)}" text-anchor="middle" class="tag">${priceText(detail, pts[i][1])}</text>`;
  };

  svg.innerHTML = `
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="currentColor" stop-opacity="0.22"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/>
    </linearGradient></defs>
    <g>
      ${range === "1D" && base ? `<line x1="0" x2="${W}" y1="${y(base)}" y2="${y(base)}" stroke="var(--muted)" stroke-dasharray="3 4" stroke-width="1"/>` : ""}
      <polygon points="0,${H} ${line} ${W},${H}" fill="url(#g)"/>
      <polyline points="${line}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${tag(hi, true)}${hi !== lo ? tag(lo, false) : ""}
      <g id="cross" visibility="hidden">
        <line id="cx" y1="0" y2="${H}" stroke="var(--muted)" stroke-width="1"/>
        <circle id="cd" r="5" fill="currentColor" stroke="var(--bg)" stroke-width="2"/>
      </g>
    </g>`;
  svg._geom = { pts, x, y, W, base };
}

function onPoint(e) {
  const svg = $("#chart"), g = svg._geom;
  if (!g) return;
  const rect = svg.getBoundingClientRect();
  const rel = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
  const i = Math.round(rel * (g.pts.length - 1));
  const [t, v] = g.pts[i];
  const cross = svg.querySelector("#cross");
  cross.setAttribute("visibility", "visible");
  svg.querySelector("#cx").setAttribute("x1", g.x(i));
  svg.querySelector("#cx").setAttribute("x2", g.x(i));
  svg.querySelector("#cd").setAttribute("cx", g.x(i));
  svg.querySelector("#cd").setAttribute("cy", g.y(v));
  setHeader(v, g.base, whenText(t, range));
}

function endPoint() {
  $("#chart").querySelector("#cross")?.setAttribute("visibility", "hidden");
  if (detail) resetHeader();
}

const chartEl = $("#chart");
chartEl.addEventListener("pointerdown", (e) => { chartEl.setPointerCapture?.(e.pointerId); onPoint(e); });
chartEl.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || e.buttons) onPoint(e); });
chartEl.addEventListener("pointerup", endPoint);
chartEl.addEventListener("pointercancel", endPoint);
chartEl.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") endPoint(); });

function renderRanges() {
  $("#ranges").innerHTML = RANGES.map(([k, label]) =>
    `<button class="range" data-r="${k}" aria-pressed="${k === range}" ${(detail.charts[k]?.length ?? 0) < 2 ? "disabled" : ""}>${label}</button>`).join("");
}

$("#ranges").addEventListener("click", (e) => {
  const b = e.target.closest(".range");
  if (!b || b.disabled) return;
  range = b.dataset.r;
  renderRanges(); drawChart(); resetHeader();
});

function renderDetail(d) {
  detail = d;
  range = (d.charts["1D"]?.length ?? 0) > 1 ? "1D" : "1M";
  $("#d-name").textContent = d.name;
  $("#d-sub").textContent = [d.symbol, d.exchange].filter(Boolean).join(" · ");
  const s = d.stats ?? {};
  const row = (k, v) => `<div class="stat"><span>${k}</span><span>${v}</span></div>`;
  const p = (v) => (v == null ? "—" : priceText(d, v));
  $("#d-stats").innerHTML = row("시가", p(s.open)) + row("전일 종가", p(s.prev)) + row("고가", p(s.high)) + row("저가", p(s.low)) +
    (s.volume ? row("거래량", volText(s.volume)) : "") + row("52주 최고", p(s.high52));
  if (s.high52 != null && s.low52 != null && s.high52 > s.low52) {
    const pos = Math.min(Math.max(((d.price - s.low52) / (s.high52 - s.low52)) * 100, 0), 100);
    $("#d-range52").innerHTML = `<div class="muted">52주 범위에서 현재 위치</div>
      <div class="bar"><i style="left:${pos}%"></i></div>
      <div class="bar-labels"><span>${p(s.low52)}</span><span>${p(s.high52)}</span></div>`;
  } else $("#d-range52").innerHTML = "";

  const kws = (d.keywords ?? [d.name]).map((k) => k.toLowerCase());
  const related = Object.values(current?.news ?? {}).flat()
    .filter((n) => kws.some((k) => n.title.toLowerCase().includes(k))).slice(0, 8);
  $("#d-news").innerHTML = related.length
    ? related.map((n) => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>
        <div class="meta">${esc(n.source)} · ${esc(timeAgo(n.published))}</div></li>`).join("")
    : `<li class="muted">오늘 브리핑에 관련 뉴스가 없어요.</li>`;

  renderRanges();
  drawChart();
  resetHeader();
}

async function route() {
  const m = location.hash.match(/^#\/s\/(.+)$/);
  if (!m) {
    $("#detail").hidden = true;
    $("#home").hidden = false;
    detail = null;
    window.scrollTo(0, homeScroll);
    return;
  }
  const symbol = decodeURIComponent(m[1]);
  if ($("#detail").hidden) homeScroll = window.scrollY;
  $("#home").hidden = true;
  $("#detail").hidden = false;
  window.scrollTo(0, 0);
  try {
    renderDetail(await getJson(`data/symbols/${symbolFile(symbol)}`));
  } catch {
    $("#d-name").textContent = symbol;
    $("#d-price").textContent = "";
    $("#d-chg").textContent = "";
    $("#d-when").textContent = "상세 정보가 아직 없어요. 다음 브리핑 업데이트 후 다시 열어주세요.";
    $("#chart").innerHTML = ""; $("#ranges").innerHTML = ""; $("#d-stats").innerHTML = ""; $("#d-range52").innerHTML = ""; $("#d-news").innerHTML = "";
  }
}

$("#back").addEventListener("click", () => {
  if (history.length > 1 && history.state?.fromHome) history.back();
  else location.hash = "";
});
document.addEventListener("click", (e) => {
  const a = e.target.closest("a.quote");
  if (!a) return;
  e.preventDefault();
  history.pushState({ fromHome: true }, "", a.getAttribute("href"));
  route();
});
window.addEventListener("popstate", route);
window.addEventListener("hashchange", route);
let rz;
window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => detail && drawChart(), 150); });

async function init() {
  try {
    const [latest, index] = await Promise.all([getJson("data/latest.json"), getJson("data/index.json").catch(() => [])]);
    $("#archive").innerHTML = `<option value="latest">최신 브리핑</option>` +
      index.map((e) => `<option value="${esc(e.id)}">${esc(e.date)} ${SESSION[e.session] ?? ""}</option>`).join("");
    render(latest);
  } catch {
    $("#stamp").textContent = "아직 브리핑이 없어요. 잠시 후 다시 열어주세요.";
  }
}

init().then(route);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
