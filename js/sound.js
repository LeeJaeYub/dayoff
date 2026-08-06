/**
 * Toss Style Web Audio API Sound Synthesizer
 * External audio asset dependencies are avoided by generating sounds programmatically.
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
  }

  // AudioContext는 유저 인터랙션 이후에만 활성화할 수 있으므로 지연 초기화 수행
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  // 1. 드럼 피커 회전 시 발생하는 극히 짧은 틱 소리 ("탁")
  playTick() {
    if (this.isMuted) return;
    this.init();
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    // 높은 주파수에서 순식간에 떨어지며 Haptic 틱감을 모사함
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.012);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.012);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.015);
  }

  // 2. 카드를 탭할 때 은은하고 고급스러운 선택 피드백 ("톡")
  playSelect() {
    if (this.isMuted) return;
    this.init();

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(580, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.03);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.035);
  }

  // 3. 연차 계산 결과 갱신 완료 시의 맑고 우아한 벨 소리 ("샤링~")
  playSuccess() {
    if (this.isMuted) return;
    this.init();

    const now = this.ctx.currentTime;
    
    // 고급스러운 3화음 (C6 - E6 - G6) 순차 재생 (Arpeggio)
    const notes = [1046.50, 1318.51, 1568.00]; // C6, E6, G6
    const delayTimes = [0, 0.05, 0.1]; // 각각의 화음 시작 딜레이

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delayTimes[idx]);
      
      // 약간의 잔향을 남겨 맑은 소리 유도
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.05, now + delayTimes[idx] + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delayTimes[idx] + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + delayTimes[idx]);
      osc.stop(now + delayTimes[idx] + 0.45);
    });
  }
}

export const soundEngine = new SoundEngine();
