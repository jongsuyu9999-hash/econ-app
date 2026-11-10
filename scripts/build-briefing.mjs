// 시세·뉴스를 모아 public/data/ 에 브리핑 JSON을 만듭니다.
// 사용법: node scripts/build-briefing.mjs          (실제 데이터)
//         node scripts/build-briefing.mjs --mock   (네트워크 없이 샘플 데이터)
import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";
import {
  MARKETS, FEEDS, NEWS_PER_CATEGORY, NEWS_MAX_AGE_HOURS, ARCHIVE_KEEP, AI_MODEL,
} from "../config.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const MOCK = process.argv.includes("--mock");
const UA = "Mozilla/5.0 (compatible; EconBriefingBot/1.0)";

// ---------- 시간 (KST) ----------
function kstNow() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const date = kst.toISOString().slice(0, 10);
  const hour = kst.getUTCHours();
  const session = hour < 12 ? "am" : "pm";
  return { iso: now.toISOString(), date, session };
}

// ---------- 시세 (Yahoo Finance 차트 API) ----------
async function fetchChart(symbol, range, interval) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const r = (await res.json())?.chart?.result?.[0];
  if (!r) throw new Error("결과 없음");
  const q = r.indicators?.quote?.[0] ?? {};
  const rows = (r.timestamp ?? []).map((t, i) => ({
    t: t * 1000, o: q.open?.[i], h: q.high?.[i], l: q.low?.[i], c: q.close?.[i], v: q.volume?.[i],
  })).filter((x) => x.c != null);
  return { meta: r.meta, rows };
}

const round = (n) => (n == null ? null : Math.round(n * 10000) / 10000);
const pts = (rows) => rows.map((x) => [x.t, round(x.c)]);

// 종목 하나의 요약(홈 카드용)과 상세(차트·통계) 데이터를 함께 만듭니다.
async function fetchQuote(item) {
  const [daily, d1, d5] = await Promise.all([
    fetchChart(item.symbol, "1y", "1d"),
    fetchChart(item.symbol, "1d", "5m").catch(() => null),
    fetchChart(item.symbol, "5d", "30m").catch(() => null),
  ]);
  const m = daily.meta;
  const closes = daily.rows.map((x) => x.c);
  const price = m.regularMarketPrice ?? closes.at(-1);
  // 전일 종가: 일봉 기준 직전 값. 마지막 일봉이 현재가와 다르면(오늘 봉이 아직 없음) 마지막 일봉이 전일 종가.
  let prev = closes.length >= 2 ? closes.at(-2) : m.previousClose;
  if (closes.length && Math.abs(closes.at(-1) - price) / price > 0.0001) prev = closes.at(-1);
  const today = daily.rows.at(-1) ?? {};
  const year = daily.rows;

  const summary = {
    ...item,
    keywords: undefined,
    price,
    prev,
    change: price - prev,
    changePct: ((price - prev) / prev) * 100,
    spark: closes.slice(-20),
    time: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null,
  };

  const detail = {
    ...summary,
    keywords: item.keywords ?? [item.name],
    currency: m.currency,
    exchange: m.fullExchangeName ?? m.exchangeName,
    stats: {
      open: today.o ?? null,
      high: m.regularMarketDayHigh ?? today.h ?? null,
      low: m.regularMarketDayLow ?? today.l ?? null,
      prev,
      volume: m.regularMarketVolume ?? today.v ?? null,
      high52: m.fiftyTwoWeekHigh ?? Math.max(...year.map((x) => x.h ?? x.c)),
      low52: m.fiftyTwoWeekLow ?? Math.min(...year.map((x) => x.l ?? x.c)),
    },
    charts: {
      "1D": d1 ? pts(d1.rows) : [],
      "1W": d5 ? pts(d5.rows) : pts(year.slice(-5)),
      "1M": pts(year.slice(-22)),
      "3M": pts(year.slice(-66)),
      "1Y": pts(year),
    },
  };
  return { summary, detail };
}

async function fetchMarkets() {
  const groups = [];
  const details = [];
  for (const g of MARKETS) {
    const results = await Promise.all(
      g.items.map((it) =>
        fetchQuote(it).catch((e) => {
          console.warn(`⚠ 시세 실패 ${it.symbol}: ${e.message}`);
          return { summary: { ...it, keywords: undefined, error: true } };
        }),
      ),
    );
    groups.push({ group: g.group, items: results.map((r) => r.summary) });
    for (const r of results) if (r.detail) details.push({ ...r.detail, group: g.group });
  }
  return { groups, details };
}

const symbolFile = (symbol) => symbol.replace(/[^A-Za-z0-9]/g, "_") + ".json";

// ---------- 뉴스 (RSS) ----------
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" });
const text = (v) => (v == null ? "" : typeof v === "object" ? v["#text"] ?? "" : String(v));
const clean = (s) =>
  text(s).replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();

function toIso(s) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function fetchFeed(feed) {
  const res = await fetch(feed.url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = xml.parse(await res.text());
  let items = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? [];
  if (!Array.isArray(items)) items = [items];
  return items.map((it) => ({
    title: clean(it.title),
    link: text(it.link?.["@href"] ?? it.link ?? it.guid),
    summary: clean(it.description ?? it.summary).slice(0, 160),
    published: toIso(text(it.pubDate ?? it.published ?? it.updated ?? it["dc:date"])),
    source: feed.source,
    category: feed.category,
  })).filter((n) => n.title && n.link);
}

async function fetchNews() {
  const all = (
    await Promise.all(
      FEEDS.map((f) =>
        fetchFeed(f).catch((e) => {
          console.warn(`⚠ 뉴스 실패 ${f.source}: ${e.message}`);
          return [];
        }),
      ),
    )
  ).flat();

  const cutoff = Date.now() - NEWS_MAX_AGE_HOURS * 3600 * 1000;
  const seen = new Set();
  const fresh = all
    .filter((n) => {
      const t = Date.parse(n.published);
      return Number.isNaN(t) || t >= cutoff;
    })
    .filter((n) => {
      const key = n.title.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 30);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0));

  const out = {};
  for (const n of fresh) {
    (out[n.category] ??= []);
    if (out[n.category].length < NEWS_PER_CATEGORY) out[n.category].push(n);
  }
  return out;
}

// ---------- AI 요약 (선택) ----------
async function summarize(markets, news, session) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const marketLines = markets.flatMap((g) =>
    g.items.filter((i) => !i.error).map((i) => `${i.name}: ${i.price.toFixed(2)} (${i.changePct >= 0 ? "+" : ""}${i.changePct.toFixed(2)}%)`),
  );
  const newsLines = Object.values(news).flat().slice(0, 30).map((n) => `- [${n.source}] ${n.title}`);
  const when = session === "am" ? "아침(전날 미국장 마감 후, 국내장 개장 전)" : "저녁(국내장 마감 후, 미국장 개장 전)";

  const prompt = `당신은 개인 투자자를 위한 경제 브리핑 작성자입니다. 지금은 ${when} 브리핑입니다.
아래 시세와 뉴스 제목만 근거로 한국어 브리핑을 쓰세요. 주어지지 않은 수치·사실은 지어내지 말고, 매수·매도 권유는 하지 마세요.

[시세]
${marketLines.join("\n")}

[뉴스 제목]
${newsLines.join("\n")}

다음 JSON만 출력하세요 (다른 텍스트 없이):
{"headline": "한 줄 요약(40자 이내)", "points": ["핵심 3~5개, 각 1~2문장"], "watch": ["다음 장에서 지켜볼 것 2~3개"]}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`AI 요약 실패 HTTP ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const raw = body.content?.map((c) => c.text ?? "").join("") ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

// ---------- 샘플 데이터 ----------
function mockData() {
  const rnd = (seed) => () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const r = rnd(42);
  const base = { "^KS11": 2650, "^KQ11": 760, "005930.KS": 72000, "000660.KS": 185000, "^GSPC": 5900, "^IXIC": 19000, "^DJI": 43000, "^SOX": 5100, "KRW=X": 1385, "JPYKRW=X": 9.05, "DX-Y.NYB": 104.2, "^TNX": 4.32, "CL=F": 71.5, "GC=F": 2650 };
  const details = [];
  const walk = (n, v, vol, stepMs, end) => Array.from({ length: n }, (_, i) => [end - (n - 1 - i) * stepMs, (v *= 1 + (r() - 0.5) * vol)]);
  const markets = MARKETS.map((g) => ({
    group: g.group,
    items: g.items.map((it) => {
      const end = Date.now();
      const year = walk(250, (base[it.symbol] ?? 100) * 0.85, 0.025, 86400e3, end);
      const closes = year.map((p) => p[1]);
      const prev = closes.at(-2);
      const intraday = walk(78, prev, 0.003, 300e3, end);
      const price = intraday.at(-1)[1];
      year[year.length - 1][1] = price; closes[closes.length - 1] = price;
      const summary = { ...it, keywords: undefined, price, prev, change: price - prev, changePct: ((price - prev) / prev) * 100, spark: closes.slice(-20) };
      details.push({
        ...summary, group: g.group, keywords: it.keywords ?? [it.name], currency: "KRW", exchange: "샘플",
        stats: { open: prev * 1.001, high: Math.max(...intraday.map((p) => p[1])), low: Math.min(...intraday.map((p) => p[1])), prev, volume: 12345678, high52: Math.max(...closes), low52: Math.min(...closes) },
        charts: { "1D": intraday, "1W": walk(65, closes.at(-6), 0.004, 1800e3, end), "1M": year.slice(-22), "3M": year.slice(-66), "1Y": year },
      });
      return summary;
    }),
  }));
  const now = Date.now();
  const mk = (cat, src, i, t) => ({ title: t, link: "https://example.com/" + i, summary: "샘플 기사 요약입니다.", published: new Date(now - i * 1800e3).toISOString(), source: src, category: cat });
  const news = {
    국내: ["코스피, 외국인 순매수에 강보합 마감", "한은 기준금리 동결 전망 우세", "반도체 수출 3개월 연속 증가", "원/달러 환율 1380원대 등락", "2차전지주 차익실현 매물에 약세"].map((t, i) => mk("국내", "샘플뉴스", i, t)),
    해외: ["S&P 500 hits record as tech rallies", "Fed officials signal patience on rate cuts", "Oil slips on demand worries", "Treasury yields edge higher ahead of CPI"].map((t, i) => mk("해외", "Sample", i + 10, t)),
  };
  const ai = {
    headline: "(샘플) 기술주 강세 속 국내 증시 강보합",
    points: ["샘플 요약입니다. 실제 배포 시 API 키를 넣으면 AI가 매번 새로 작성합니다.", "미국 기술주 강세가 국내 반도체주에 우호적으로 작용했습니다.", "환율은 1380원대에서 등락했습니다."],
    watch: ["미국 소비자물가지수 발표", "외국인 수급 방향"],
  };
  return { markets, details, news, ai };
}

// ---------- 저장 ----------
async function readJson(p, fallback) {
  try { return JSON.parse(await readFile(p, "utf8")); } catch { return fallback; }
}

async function main() {
  const t = kstNow();
  let markets, details, news, ai = null;

  if (MOCK) {
    ({ markets, details, news, ai } = mockData());
  } else {
    let m;
    [m, news] = await Promise.all([fetchMarkets(), fetchNews()]);
    ({ groups: markets, details } = m);
    try { ai = await summarize(markets, news, t.session); }
    catch (e) { console.warn("⚠", e.message); }
  }

  const okQuotes = markets.flatMap((g) => g.items).filter((i) => !i.error).length;
  const newsCount = Object.values(news).flat().length;
  if (!MOCK && okQuotes === 0 && newsCount === 0) {
    console.error("✖ 시세와 뉴스를 하나도 가져오지 못했습니다. 이전 브리핑을 유지합니다.");
    process.exit(1);
  }

  const id = `${t.date}-${t.session}`;
  const briefing = { id, date: t.date, session: t.session, generatedAt: t.iso, ai, markets, news, mock: MOCK || undefined };

  await mkdir(path.join(DATA_DIR, "archive"), { recursive: true });
  await writeFile(path.join(DATA_DIR, "latest.json"), JSON.stringify(briefing));
  await writeFile(path.join(DATA_DIR, "archive", `${id}.json`), JSON.stringify(briefing));

  // 종목 상세 (차트·통계) — 항상 최신으로 덮어씀
  await mkdir(path.join(DATA_DIR, "symbols"), { recursive: true });
  for (const d of details) {
    await writeFile(path.join(DATA_DIR, "symbols", symbolFile(d.symbol)), JSON.stringify({ ...d, generatedAt: t.iso }));
  }

  const indexPath = path.join(DATA_DIR, "index.json");
  const index = (await readJson(indexPath, [])).filter((e) => e.id !== id);
  index.unshift({ id, date: t.date, session: t.session, headline: ai?.headline ?? null });
  const keep = index.slice(0, ARCHIVE_KEEP);
  await writeFile(indexPath, JSON.stringify(keep));

  // 보관 기간이 지난 파일 정리
  const keepIds = new Set(keep.map((e) => e.id));
  for (const f of await readdir(path.join(DATA_DIR, "archive"))) {
    if (f.endsWith(".json") && !keepIds.has(f.replace(".json", ""))) await unlink(path.join(DATA_DIR, "archive", f));
  }

  console.log(`✔ ${id} 브리핑 생성 — 시세 ${okQuotes}개, 뉴스 ${newsCount}건, AI 요약 ${ai ? "있음" : "없음"}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
