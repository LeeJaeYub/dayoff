import { state } from './app.js';

/**
 * 선택된 연차 조합(vacation)이 속한 월들의 달력을 동적으로 생성하여 렌더링
 * 만약 연차가 두 달에 걸쳐 있다면 두 달 모두 표시함 (토스 스타일의 직관적 UX)
 */
export function renderCalendar(vacation) {
  const container = document.getElementById('calendar-months-container');
  if (!container) return;
  
  if (!vacation) {
    container.innerHTML = `
      <div class="calendar-empty">
        <p>계산된 일정 중 하나를 탭하면 여기에 달력이 나타나요.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  
  // 휴가 시작일과 종료일 객체 생성
  const startParts = vacation.startDateStr.split('-');
  const endParts = vacation.endDateStr.split('-');
  
  const startDate = new Date(Number(startParts[0]), Number(startParts[1]) - 1, Number(startParts[2]));
  const endDate = new Date(Number(endParts[0]), Number(endParts[1]) - 1, Number(endParts[2]));
  
  // 휴가가 걸쳐 있는 연도/월 목록 추출 (예: 2026-12 ~ 2027-01)
  const activeMonths = [];
  const curr = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const limit = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  
  while (curr <= limit) {
    activeMonths.push({
      year: curr.getFullYear(),
      month: curr.getMonth()
    });
    curr.setMonth(curr.getMonth() + 1);
  }

  // 각 월에 대한 달력 카드 렌더링
  activeMonths.forEach(({ year, month }, index) => {
    const monthCard = document.createElement('div');
    monthCard.className = 'calendar-month-card fade-in';
    monthCard.style.animationDelay = `${index * 80}ms`; // 순차 등장 애니메이션 (Stagger)
    
    // 월 타이틀
    const title = document.createElement('div');
    title.className = 'calendar-month-title';
    title.innerText = `${year}년 ${month + 1}월`;
    monthCard.appendChild(title);
    
    // 요일 헤더
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const headerGrid = document.createElement('div');
    headerGrid.className = 'calendar-weekdays-grid';
    weekdays.forEach(day => {
      const cell = document.createElement('div');
      cell.className = 'calendar-weekday-cell';
      if (day === '일') cell.classList.add('sunday');
      if (day === '토') cell.classList.add('saturday');
      cell.innerText = day;
      headerGrid.appendChild(cell);
    });
    monthCard.appendChild(headerGrid);
    
    // 날짜 그리드
    const daysGrid = document.createElement('div');
    daysGrid.className = 'calendar-days-grid';
    
    // 1일의 요일과 해당 월의 총 일수 계산
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    // 1일 이전의 빈 공간(이전 달 일수 채우기)
    for (let i = 0; i < firstDayIndex; i++) {
      const emptyCell = document.createElement('div');
      emptyCell.className = 'calendar-day-cell empty';
      daysGrid.appendChild(emptyCell);
    }
    
    // 날짜 채우기
    for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-day-cell';
      
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const dayOfWeek = new Date(year, month, dayNum).getDay();
      
      const holidayName = state.holidays[dateStr];
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isOriginalRest = isWeekend || !!holidayName;
      
      // 일자 라벨
      const dateLabel = document.createElement('span');
      dateLabel.className = 'day-number';
      dateLabel.innerText = dayNum;
      cell.appendChild(dateLabel);
      
      // 공휴일 이름 소형 말풍선/텍스트 추가
      if (holidayName) {
        const holidayLabel = document.createElement('span');
        holidayLabel.className = 'holiday-name-tag';
        // 긴 공휴일 이름은 적절히 생략
        holidayLabel.innerText = holidayName.length > 5 ? holidayName.substring(0, 4) + '..' : holidayName;
        cell.appendChild(holidayLabel);
      }
      
      // 상태 구분
      // 1. 현재 선택된 휴가 범위 내에 있는지 판단
      const isInsideVacation = dateStr >= vacation.startDateStr && dateStr <= vacation.endDateStr;
      
      if (isInsideVacation) {
        cell.classList.add('in-vacation');
        
        if (isOriginalRest) {
          // 원래 쉬는 날 (주말/공휴일)인데 연합 휴가에 속함
          cell.classList.add('vacation-rest');
          if (holidayName) cell.classList.add('holiday-day');
        } else {
          // 원래 근무일인데 연차를 내어 쉬는 날! (Toss 블루 테마)
          cell.classList.add('vacation-leave');
          
          const leaveLabel = document.createElement('span');
          leaveLabel.className = 'leave-label-tag';
          leaveLabel.innerText = '연차';
          cell.appendChild(leaveLabel);
        }
      } else {
        // 일반 날짜들
        if (holidayName) {
          cell.classList.add('holiday-day');
        } else if (dayOfWeek === 0) {
          cell.classList.add('sunday');
        } else if (dayOfWeek === 6) {
          cell.classList.add('saturday');
        }
      }
      
      daysGrid.appendChild(cell);
    }
    
    monthCard.appendChild(daysGrid);
    container.appendChild(monthCard);
  });
}
