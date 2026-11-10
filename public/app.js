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
        return `<div class="quote">
          <div class="name">${esc(q.name)}</div>
          <div class="price">${unit}${fmt(q.price, q.digits)}${suffix}</div>
          <div class="chg ${cls}">${arrow} ${fmt(Math.abs(q.change), q.digits)} (${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%)</div>
          <div class="${cls}">${spark(q.spark, cls)}</div>
        </div>`;
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

init();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
