import { soundEngine } from './sound.js';
import { renderCalendar } from './calendar.js';

// 글로벌 상태 객체
export const state = {
  holidays: {},          // { 'YYYY-MM-DD': '공휴일이름' }
  startDate: null,       // 계산 시작일 (오늘)
  endDate: null,         // 계산 종료일 (오늘 + 12개월)
  dateList: [],          // [{ dateStr, isOriginalRest, name, dateObj, dayOfWeek }]
  selectedLeaveDays: 3,  // 기본 연차 선택값
  vacations: [],         // 계산된 최적 연차 조합 리스트
  selectedVacation: null // 현재 달력에 활성화된 연차 조합
};

/**
 * 1. 공휴일 JSON 데이터 가져오기 및 초기화
 */
export async function initApp() {
  try {
    const response = await fetch('./data/holidays.json');
    if (!response.ok) throw new Error('공휴일 데이터를 가져올 수 없습니다.');
    const data = await response.json();
    
    // 구조 분해 할당으로 공휴일 맵 구축
    const holidayMap = {};
    if (data && data.years) {
      Object.keys(data.years).forEach(year => {
        data.years[year].forEach(h => {
          holidayMap[h.date] = h.name;
        });
      });
    }
    state.holidays = holidayMap;
    
    // 오늘 날짜 및 12개월 범위 설정 (고정된 세션 날짜인 2026-08-06을 기본값으로 하되, 실제 실행 시 오늘 기준 동적 처리도 가능하게 함)
    const today = new Date();
    // 세션 상 오늘 날짜가 2026년 8월 6일이므로, 만약 2026년 근처라면 2026-08-06을 기준으로 삼음 (테스트 편의성)
    if (today.getFullYear() < 2026) {
      state.startDate = new Date('2026-08-06');
    } else {
      state.startDate = today;
    }
    
    // 종료일은 시작일로부터 정확히 12개월 뒤
    state.endDate = new Date(state.startDate);
    state.endDate.setMonth(state.endDate.getMonth() + 12);
    
    // 범위 내의 모든 일자 생성 및 캐싱
    generateDateList();
    
    // 드럼 피커 초기화 및 이벤트 연결
    initDrumPicker();
    
    // 초기 연차 일수에 대해 계산 실행
    calculateAndRender();
    
  } catch (err) {
    console.error('앱 초기화 오류:', err);
    showErrorState();
  }
}

/**
 * 2. 12개월 범위의 날짜 배열 생성 및 원래 휴일(주말/공휴일) 여부 파악
 */
function generateDateList() {
  const dates = [];
  const current = new Date(state.startDate);
  
  while (current <= state.endDate) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    
    const dayOfWeek = current.getDay(); // 0: 일요일, 6: 토요일
    const holidayName = state.holidays[dateStr];
    const isOriginalRest = (dayOfWeek === 0 || dayOfWeek === 6 || !!holidayName);
    
    dates.push({
      dateStr,
      dateObj: new Date(current),
      dayOfWeek,
      isOriginalRest,
      name: holidayName || (dayOfWeek === 0 ? '일요일' : dayOfWeek === 6 ? '토요일' : '')
    });
    
    // 다음 날로 이동
    current.setDate(current.getDate() + 1);
  }
  state.dateList = dates;
}

/**
 * 3. 연차 최적화 핵심 알고리즘 (O(N^2) 구간 스캔 후 오버랩 필터링)
 */
export function calculateBestVacations(maxLeaveDays) {
  const N = state.dateList.length;
  const candidates = [];
  
  // 모든 가능한 시작점 i와 끝점 j를 탐색
  for (let i = 0; i < N; i++) {
    let leaveCost = 0;
    
    for (let j = i; j < N; j++) {
      // 해당 일자가 평일(근무일)이면 연차 소모
      if (!state.dateList[j].isOriginalRest) {
        leaveCost++;
      }
      
      // 입력받은 최대 연차 개수를 초과하면 더 이상 확장 불가
      if (leaveCost > maxLeaveDays) {
        break;
      }
      
      // 연차를 최소 1일 이상 사용하는 조합만 의미가 있음
      if (leaveCost === 0) {
        continue;
      }
      
      const length = j - i + 1;
      
      // '극대 구간(Maximal Interval)' 검증: 
      // 이 휴가 구간의 직전일과 직후일이 존재하고 그것들이 오리지널 휴일이면 안 됨.
      // (만약 오리지널 휴일이라면, 그 휴일도 비용 없이 연휴에 포함될 수 있으므로 이 구간은 불완전한 조합임)
      const prevDayIsRest = i > 0 && state.dateList[i - 1].isOriginalRest;
      const nextDayIsRest = j < N - 1 && state.dateList[j + 1].isOriginalRest;
      
      if (prevDayIsRest || nextDayIsRest) {
        continue;
      }
      
      // 효율성 계산
      const efficiency = Number((length / leaveCost).toFixed(2));
      
      candidates.push({
        startIndex: i,
        endIndex: j,
        startDateStr: state.dateList[i].dateStr,
        endDateStr: state.dateList[j].dateStr,
        length,
        cost: leaveCost,
        efficiency,
        label: getVacationLabel(length)
      });
    }
  }
  
  // 가성비(효율) 내림차순, 길이 내림차순, 비용 오름차순으로 1차 정렬
  candidates.sort((a, b) => {
    if (b.efficiency !== a.efficiency) return b.efficiency - a.efficiency;
    if (b.length !== a.length) return b.length - a.length;
    return a.cost - b.cost;
  });
  
  // 오버랩(중복 시즌) 제거 로직: 효율이 극대화된 대표 일정 위주로 남김
  const selected = [];
  
  for (const cand of candidates) {
    let hasOverlap = false;
    for (const sel of selected) {
      // 날짜가 겹치는지 검사
      const maxStart = Math.max(cand.startIndex, sel.startIndex);
      const minEnd = Math.min(cand.endIndex, sel.endIndex);
      if (maxStart <= minEnd) {
        hasOverlap = true;
        break;
      }
    }
    
    if (!hasOverlap) {
      selected.push(cand);
    }
    
    // 상위 6개 황금 조합만 추천
    if (selected.length >= 6) {
      break;
    }
  }
  
  return selected;
}

/**
 * 휴가 길이에 따른 맞춤형 위트 데코레이션 문구 (Toss Style Copywriting)
 */
function getVacationLabel(length) {
  if (length <= 3) return '⚡️ 짧고 굵은 리프레시';
  if (length <= 5) return '✨ 주말 앞뒤 황금 찬스';
  if (length <= 8) return '✈️ 비행기 표 끊기 좋은 연휴';
  return '🏆 인생 최대 역대급 황금휴가';
}

/**
 * 4. UI 렌더링 및 인터랙션 핸들링
 */
export function calculateAndRender() {
  const container = document.getElementById('results-container');
  
  // 1. 결과 영역 스켈레톤 상태 연출 (토스 감성)
  container.innerHTML = `
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
  `;
  
  setTimeout(() => {
    const list = calculateBestVacations(state.selectedLeaveDays);
    state.vacations = list;
    
    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p class="empty-title">아직 추천 일정이 없어요</p>
          <p class="empty-subtitle">연차 일수를 1일 이상으로 설정해 보세요.</p>
        </div>
      `;
      state.selectedVacation = null;
      renderCalendar(null);
      return;
    }
    
    // 카드가 로딩 완료된 직후 경쾌한 성공음 1회 재생
    soundEngine.playSuccess();
    
    container.innerHTML = '';
    list.forEach((vac, idx) => {
      const card = document.createElement('div');
      card.className = `result-card ${idx === 0 ? 'best-deal' : ''}`;
      if (state.selectedVacation && state.selectedVacation.startDateStr === vac.startDateStr) {
        card.classList.add('active');
      }
      
      const startFormatted = formatDateString(vac.startDateStr);
      const endFormatted = formatDateString(vac.endDateStr);
      
      // 가로형 배지들과 큼직한 타이포그래피 구성
      card.innerHTML = `
        <div class="card-header">
          <span class="efficiency-badge ${idx === 0 ? 'badge-gradient' : ''}">
            효율 ${vac.efficiency}배
          </span>
          <span class="card-tag">${vac.label}</span>
        </div>
        <div class="card-body">
          <div class="duration-display">
            <span class="consecutive-days">${vac.length}일 연속</span>
            <span class="sub-info">연차 ${vac.cost}일 사용</span>
          </div>
          <div class="date-range">
            ${startFormatted} ~ ${endFormatted}
          </div>
        </div>
        <div class="expand-arrow">▼ 달력으로 일정 확인</div>
      `;
      
      // 카드 선택 시 이벤트 연결
      card.addEventListener('click', () => {
        soundEngine.playSelect();
        
        // 기존 액티브 카드 해제 및 설정
        document.querySelectorAll('.result-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        
        state.selectedVacation = vac;
        
        // 캘린더 부드럽게 렌더링 및 해당 영역 하이라이트
        renderCalendar(vac);
        
        // 모바일 스크롤 대응: 캘린더 영역으로 스무스하게 스크롤
        const calSection = document.getElementById('calendar-section');
        calSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      
      container.appendChild(card);
    });
    
    // 기본으로 첫 번째(가장 효율 좋은) 카드를 선택 처리하고 달력 표시
    if (list.length > 0) {
      state.selectedVacation = list[0];
      const firstCard = container.querySelector('.result-card');
      if (firstCard) firstCard.classList.add('active');
      renderCalendar(list[0]);
    }
  }, 200); // 200ms의 인위적 지연을 주어 부드러운 스켈레톤 애니메이션 연출
}

/**
 * 날짜 문자열 포맷팅 (예: "2026-10-03" -> "10월 3일 (토)")
 */
function formatDateString(dateStr) {
  const parts = dateStr.split('-');
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const dayName = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  return `${m}월 ${d}일 (${dayName})`;
}

/**
 * 5. 세로형 드럼 휠 피커 구현 (Scroll Snap 기반 + Haptic Sound 연동)
 */
function initDrumPicker() {
  const picker = document.getElementById('drum-picker');
  const maxLeaves = 15; // 최대 설정 연차
  
  // 드럼 휠의 숫자 리스트 동적 추가
  picker.innerHTML = '';
  
  // 앞뒤로 여백 카드를 넣어 마운트 및 스냅 시 첫째/마지막 숫자가 정가운데 오도록 유도
  const dummyBefore = document.createElement('div');
  dummyBefore.className = 'picker-item dummy';
  picker.appendChild(dummyBefore);
  
  for (let i = 1; i <= maxLeaves; i++) {
    const item = document.createElement('div');
    item.className = 'picker-item';
    item.dataset.value = i;
    item.innerText = `${i}일`;
    picker.appendChild(item);
  }
  
  const dummyAfter = document.createElement('div');
  dummyAfter.className = 'picker-item dummy';
  picker.appendChild(dummyAfter);
  
  let lastSelectedIndex = -1;
  let scrollTimeout = null;
  
  // 스크롤 이벤트 수신
  picker.addEventListener('scroll', () => {
    const itemHeight = 50; // CSS에서 정의할 각 피커 아이템의 높이
    const scrollTop = picker.scrollTop;
    const selectedIndex = Math.round(scrollTop / itemHeight);
    
    // 유효 범위 보정
    if (selectedIndex < 0 || selectedIndex >= maxLeaves) return;
    
    // 스크롤 하면서 중간에 있는 아이템 스타일 업데이트 및 틱 소리 재생
    if (selectedIndex !== lastSelectedIndex) {
      lastSelectedIndex = selectedIndex;
      soundEngine.playTick();
      
      // 피커 아이템 비주얼 가중치 부여 (가운데가 가장 선명하고 큼)
      const items = picker.querySelectorAll('.picker-item:not(.dummy)');
      items.forEach((item, idx) => {
        if (idx === selectedIndex) {
          item.classList.add('selected');
        } else {
          item.classList.remove('selected');
        }
      });
      
      state.selectedLeaveDays = selectedIndex + 1;
      
      // 디바운스를 활용해 스크롤이 확실히 멈췄거나 안정화되었을 때 실시간 최적화 엔진 구동
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        calculateAndRender();
      }, 100);
    }
  });
  
  // 초기 스크롤 세팅 (기본 3일 선택)
  const defaultIdx = state.selectedLeaveDays - 1;
  setTimeout(() => {
    picker.scrollTop = defaultIdx * 50;
    const items = picker.querySelectorAll('.picker-item:not(.dummy)');
    if (items[defaultIdx]) items[defaultIdx].classList.add('selected');
  }, 100);
}

// 사운드 토글 관리
document.addEventListener('DOMContentLoaded', () => {
  const soundBtn = document.getElementById('sound-toggle');
  
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      const isMuted = soundEngine.toggleMute();
      if (isMuted) {
        soundBtn.innerHTML = '🔈 소리 끔';
        soundBtn.classList.add('muted');
      } else {
        soundBtn.innerHTML = '🔊 소리 켬';
        soundBtn.classList.remove('muted');
        soundEngine.playSelect();
      }
    });
  }
});
