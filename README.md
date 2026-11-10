# 오늘의 경제 📈

매일 **아침(07:30)·저녁(15:40)** 국내·미국 증시, 환율·금리·원자재 시황과 경제 뉴스를 자동으로 정리해 보여주는 앱입니다.
서버 없이 **GitHub 무료 기능**(Actions + Pages)만으로 돌아가고, 휴대폰 홈 화면에 앱처럼 설치할 수 있어요.

## 구조

```
GitHub Actions (매일 2번 자동 실행)
  └ scripts/build-briefing.mjs
      ├ Yahoo Finance → 지수·종목·환율·금리·원자재 시세
      ├ 언론사 RSS    → 경제 뉴스 (최근 24시간, 중복 제거)
      └ Claude API    → AI 요약 (선택, API 키 있을 때만)
  └ public/data/*.json 저장 → GitHub Pages에 배포
휴대폰/PC 브라우저 → public/ 앱이 JSON을 읽어 화면 표시
```

## 처음 설정하기 (약 10분)

1. **GitHub 저장소 만들기** — github.com 에서 새 저장소(Public 권장*)를 만들고 이 폴더 전체를 올립니다.
   ```bash
   git init && git add . && git commit -m "첫 커밋"
   git branch -M main
   git remote add origin https://github.com/<내아이디>/<저장소이름>.git
   git push -u origin main
   ```
   \* 무료 계정은 Public 저장소에서만 GitHub Pages를 쓸 수 있어요.

2. **Pages 켜기** — 저장소 → Settings → Pages → *Build and deployment*의 Source를 **GitHub Actions**로 선택.

3. **(선택) AI 요약 켜기** — console.anthropic.com 에서 API 키 발급 →
   저장소 Settings → Secrets and variables → Actions → *New repository secret*
   이름 `ANTHROPIC_API_KEY`, 값에 키 입력. 키가 없으면 요약 없이 시세·뉴스만 나옵니다.
   (API는 사용량만큼 과금돼요. 하루 2회 짧은 요약이라 사용량은 적지만, 요금은 Anthropic 요금표에서 확인하세요.)

4. **첫 실행** — 저장소 → Actions → "경제 브리핑 생성·배포" → **Run workflow**.
   1~2분 뒤 `https://<내아이디>.github.io/<저장소이름>/` 에서 앱이 열립니다.

5. **휴대폰에 설치**
   - 아이폰(Safari): 공유 버튼 → *홈 화면에 추가*
   - 안드로이드(Chrome): 메뉴 ⋮ → *앱 설치* 또는 *홈 화면에 추가*

이후에는 평일 아침·저녁 자동으로 갱신됩니다. 지난 브리핑은 오른쪽 위 목록에서 약 한 달 치를 볼 수 있어요.

## 내 마음대로 바꾸기 — `config.mjs`

- **종목 추가**: `MARKETS`에 `{ symbol: "035420.KS", name: "NAVER", digits: 0 }`처럼 추가.
  코스피는 `.KS`, 코스닥은 `.KQ`, 미국 주식은 `AAPL`처럼 티커 그대로. (Yahoo Finance에서 검색한 심볼)
- **뉴스 출처**: `FEEDS`에 RSS 주소 추가·삭제. 안 열리는 피드는 자동으로 건너뜁니다.
- **실행 시간**: `.github/workflows/briefing.yml`의 `cron` (UTC 기준 = 한국시간 − 9시간).

## 내 컴퓨터에서 미리보기

```bash
npm install
npm run build:mock   # 샘플 데이터 (인터넷 불필요)
npm run build        # 실제 데이터
npm run dev          # http://localhost:5173
```

## 알아둘 점

- Yahoo Finance 시세는 비공식 경로라 지연되거나 가끔 막힐 수 있어요. 실패한 항목은 "불러오지 못함"으로 표시되고 나머지는 정상 표시됩니다.
- GitHub 예약 실행은 몇 분~수십 분 늦게 시작될 수 있어요.
- 저장소에 60일간 변경이 없으면 GitHub가 예약 실행을 멈출 수 있는데, 이 앱은 매번 데이터를 커밋하므로 보통 계속 돌아갑니다.
- 국내 증시는 빨강=상승, 파랑=하락으로 표시합니다.
- 투자 판단의 근거로 쓰기 전에 원문 기사와 공식 시세를 확인하세요.
