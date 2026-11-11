// 程序化音效 —— 使用 Web Audio 生成原创音效，遵守自动播放限制。
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  muted = false;
  private masterVolume = 0.8;
  private sfxVolume = 0.8;
  private musicVolume = 0.6;

  // 首次有效交互后调用
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.masterGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.masterGain);
  }

  setVolumes(master: number, music: number, sfx: number) {
    this.masterVolume = master;
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (this.masterGain) this.masterGain.gain.value = master;
    if (this.musicGain) this.musicGain.gain.value = music;
    if (this.sfxGain) this.sfxGain.gain.value = sfx;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType = 'sine',
    gain = 0.2,
    when = 0,
    dest?: AudioNode,
    slideTo?: number,
  ) {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest ?? this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  sfx(name: 'click' | 'summon' | 'hit' | 'upgrade' | 'fuse' | 'victory') {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    switch (name) {
      case 'click': this.tone(600, 0.08, 'square', 0.1); break;
      case 'summon':
        this.tone(440, 0.3, 'sine', 0.15, 0, undefined, 880);
        this.tone(880, 0.2, 'triangle', 0.1, 0.15);
        break;
      case 'hit': this.tone(220, 0.1, 'square', 0.12, 0, undefined, 120); break;
      case 'upgrade':
        this.tone(523, 0.15, 'triangle', 0.15);
        this.tone(659, 0.15, 'triangle', 0.15, 0.1);
        this.tone(784, 0.25, 'triangle', 0.15, 0.2);
        break;
      case 'fuse':
        this.tone(880, 0.4, 'sine', 0.12, 0, undefined, 1320);
        this.tone(1760, 0.3, 'triangle', 0.1, 0.4);
        break;
      case 'victory':
        this.tone(523, 0.2, 'triangle', 0.15);
        this.tone(659, 0.2, 'triangle', 0.15, 0.15);
        this.tone(784, 0.2, 'triangle', 0.15, 0.3);
        this.tone(1047, 0.4, 'triangle', 0.15, 0.45);
        break;
    }
  }
}
