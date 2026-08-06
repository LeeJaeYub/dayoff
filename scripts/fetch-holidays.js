import fs from 'fs';
import path from 'path';

// Node.js v20.6+ natively supports --env-file=.env, which populates process.env.
// In case the script is run without --env-file, we can also check if process.env.KASI_API_KEY is present.
const apiKey = process.env.KASI_API_KEY;

if (!apiKey || apiKey === 'your_kasi_api_key_here') {
  console.error('\x1b[31m%s\x1b[0m', '❌ 에러: KASI_API_KEY가 설정되지 않았거나 기본값입니다.');
  console.error('설정 방법:');
  console.error('  1. 프로젝트 루트에 \x1b[33m.env\x1b[0m 파일을 생성하세요.');
  console.error('  2. \x1b[32mKASI_API_KEY=공공데이터포털_발급_키\x1b[0m 형식으로 키를 입력하세요.');
  console.error('  3. 실행: \x1b[36mnpm run fetch-holidays\x1b[0m\n');
  process.exit(1);
}

const YEARS = [2026, 2027];
const BASE_URL = 'http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';

// 헬퍼: 밀리초 대기
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchHolidaysForMonth(year, month) {
  const monthStr = String(month).padStart(2, '0');
  
  // 공공데이터포털 API의 특성상 서비스 키 인코딩 깨짐을 방지하기 위해 URL 객체 대신 쿼리 문자열 직접 구성
  // (이미 인코딩된 키가 입력되었을 수도 있고, 디코딩된 키가 들어왔을 수도 있으므로 그대로 붙이는 것이 가장 안전함)
  const url = `${BASE_URL}?ServiceKey=${apiKey}&solYear=${year}&solMonth=${monthStr}&_type=json&numOfRows=100`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP 에러: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (err) {
    console.error(`\n   ⚠️ [${year}년 ${monthStr}월] 페치 중 오류가 발생했습니다: ${err.message}`);
    return null;
  }
}

function extractHolidays(data) {
  const holidays = [];
  const body = data?.response?.body;
  if (!body) return holidays;
  
  const items = body.items;
  if (!items || items === '') return holidays;
  
  const item = items.item;
  if (!item) return holidays;
  
  // 데이터 포털 특성: 항목이 1개일 때는 객체로, 여러 개일 때는 배열로 반환함
  const itemArray = Array.isArray(item) ? item : [item];
  
  for (const rawItem of itemArray) {
    if (rawItem.isHoliday === 'Y') {
      // locdate는 보통 20260101 같은 숫자 또는 문자열
      const locdateStr = String(rawItem.locdate);
      if (locdateStr.length === 8) {
        const y = locdateStr.substring(0, 4);
        const m = locdateStr.substring(4, 6);
        const d = locdateStr.substring(6, 8);
        const formattedDate = `${y}-${m}-${d}`;
        
        holidays.push({
          date: formattedDate,
          name: rawItem.dateName,
          isHoliday: true
        });
      }
    }
  }
  return holidays;
}

async function main() {
  console.log('\n==================================================');
  console.log('🎈 \x1b[36m한국 공휴일 데이터 정적 페처 (fetch-holidays)\x1b[0m');
  console.log('==================================================');
  console.log(`대상 연도: ${YEARS.join(', ')}`);
  console.log('공공데이터포털 API를 통해 공휴일 정보를 수집합니다...\n');

  const result = {
    generatedAt: new Date().toISOString().split('T')[0],
    years: {}
  };

  for (const year of YEARS) {
    console.log(`📅 \x1b[33m${year}년\x1b[0m 데이터를 가져오는 중...`);
    result.years[year] = [];
    
    for (let month = 1; month <= 12; month++) {
      process.stdout.write(`  - ${month}월... `);
      const data = await fetchHolidaysForMonth(year, month);
      
      if (data) {
        const monthHolidays = extractHolidays(data);
        result.years[year].push(...monthHolidays);
        process.stdout.write(`✅ 성공 (공휴일 ${monthHolidays.length}개 발견)\n`);
      } else {
        process.stdout.write(`❌ 실패\n`);
      }
      
      // API 서버 부하 방지 및 안정성을 위해 짧은 대기 시간 추가
      await delay(150);
    }
    
    // 연도별 정렬 (날짜 순)
    result.years[year].sort((a, b) => a.date.localeCompare(b.date));
    console.log(`✨ ${year}년 완료! 총 공휴일: ${result.years[year].length}개\n`);
  }

  // 데이터 디렉토리 확인 및 생성
  const dataDir = path.resolve('data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const outputPath = path.join(dataDir, 'holidays.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');

  console.log('==================================================');
  console.log(`🎉 \x1b[32m성공적으로 데이터를 저장했습니다!\x1b[0m`);
  console.log(`저장 경로: \x1b[35m${outputPath}\x1b[0m`);
  console.log('==================================================\n');
}

main().catch((err) => {
  console.error('❌ 스크립트 실행 중 치명적인 오류가 발생했습니다:', err);
  process.exit(1);
});
