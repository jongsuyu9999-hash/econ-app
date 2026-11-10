// 앱에서 다룰 지표와 뉴스 출처. 여기만 고치면 항목을 추가·삭제할 수 있어요.

export const MARKETS = [
  {
    group: "국내 증시",
    items: [
      { symbol: "^KS11", name: "코스피" },
      { symbol: "^KQ11", name: "코스닥" },
      { symbol: "005930.KS", name: "삼성전자", digits: 0 },
      { symbol: "000660.KS", name: "SK하이닉스", digits: 0 },
    ],
  },
  {
    group: "미국 증시",
    items: [
      { symbol: "^GSPC", name: "S&P 500" },
      { symbol: "^IXIC", name: "나스닥" },
      { symbol: "^DJI", name: "다우존스" },
      { symbol: "^SOX", name: "필라델피아 반도체" },
    ],
  },
  {
    group: "환율·금리·원자재",
    items: [
      { symbol: "KRW=X", name: "원/달러", digits: 1 },
      { symbol: "JPYKRW=X", name: "원/엔(1엔)", digits: 3 },
      { symbol: "DX-Y.NYB", name: "달러인덱스" },
      { symbol: "^TNX", name: "미 국채 10년", unit: "%", digits: 3 },
      { symbol: "CL=F", name: "WTI 유가", unit: "$" },
      { symbol: "GC=F", name: "금", unit: "$" },
    ],
  },
];

// RSS 주소는 언론사 사정으로 바뀔 수 있어요. 실패한 피드는 건너뛰고 나머지로 진행합니다.
export const FEEDS = [
  { source: "연합뉴스", category: "국내", url: "https://www.yna.co.kr/rss/economy.xml" },
  { source: "매일경제", category: "국내", url: "https://www.mk.co.kr/rss/30100041/" },
  { source: "매일경제 증권", category: "국내", url: "https://www.mk.co.kr/rss/50200011/" },
  { source: "한국경제", category: "국내", url: "https://www.hankyung.com/feed/finance" },
  { source: "CNBC", category: "해외", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
  { source: "CNBC Markets", category: "해외", url: "https://www.cnbc.com/id/20910258/device/rss/rss.html" },
];

export const NEWS_PER_CATEGORY = 15; // 카테고리별로 보여줄 최대 기사 수
export const NEWS_MAX_AGE_HOURS = 24; // 이보다 오래된 기사는 제외
export const ARCHIVE_KEEP = 60; // 보관할 지난 브리핑 수 (아침·저녁 각각 1개 = 약 한 달)

// AI 요약 (선택). ANTHROPIC_API_KEY가 없으면 요약 없이 시세·뉴스만 정리합니다.
export const AI_MODEL = process.env.AI_MODEL || "claude-sonnet-5-5";
