import { describe, it, expect } from 'vitest';
import { fmt } from '../components/UI';

describe('fmt.currency', () => {
  it('formats whole dollars', () => {
    expect(fmt.currency(342000)).toBe('$342,000');
  });
  it('formats zero', () => {
    expect(fmt.currency(0)).toBe('$0');
  });
  it('formats negative', () => {
    expect(fmt.currency(-500)).toBe('-$500');
  });
});

describe('fmt.pct', () => {
  it('formats percentage with 1 decimal by default', () => {
    expect(fmt.pct(6.4)).toBe('6.4%');
  });
  it('formats with custom decimals', () => {
    expect(fmt.pct(6.444, 2)).toBe('6.44%');
  });
  it('formats zero', () => {
    expect(fmt.pct(0)).toBe('0.0%');
  });
});

describe('fmt.compact', () => {
  it('formats thousands', () => {
    expect(fmt.compact(342000)).toBe('$342K');
  });
  it('formats millions', () => {
    expect(fmt.compact(1500000)).toBe('$1.5M');
  });
  it('formats sub-thousand', () => {
    expect(fmt.compact(500)).toBe('$500');
  });
});

describe('fmt.num', () => {
  it('adds thousands separator', () => {
    expect(fmt.num(1840)).toBe('1,840');
  });
  it('handles zero', () => {
    expect(fmt.num(0)).toBe('0');
  });
});
