// 可序列化的确定性随机数发生器（xoshiro128**）
// 随机状态写入存档，相同初始状态 + 相同命令序列可重放。

export interface RngState {
  s0: number;
  s1: number;
  s2: number;
  s3: number;
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

export class Random {
  s0: number;
  s1: number;
  s2: number;
  s3: number;

  constructor(seed: number) {
    // 用 splitmix32 从一个种子展开出四个状态字
    let z = seed >>> 0;
    const next = () => {
      z = (z + 0x9e3779b9) >>> 0;
      let t = z;
      t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
      t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
      return (t ^ (t >>> 15)) >>> 0;
    };
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next();
    // 避免全零状态
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  static fromState(st: RngState): Random {
    const r = new Random(1);
    r.s0 = st.s0 >>> 0;
    r.s1 = st.s1 >>> 0;
    r.s2 = st.s2 >>> 0;
    r.s3 = st.s3 >>> 0;
    return r;
  }

  getState(): RngState {
    return { s0: this.s0, s1: this.s1, s2: this.s2, s3: this.s3 };
  }

  nextUint(): number {
    const result = (rotl((this.s1 * 5) >>> 0, 7) * 9) >>> 0;
    const t = this.s1 << 9;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    return result >>> 0;
  }

  /** [0, 1) */
  next(): number {
    return this.nextUint() / 4294967296;
  }

  /** [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** 闭区间整数 [min, max] */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}
