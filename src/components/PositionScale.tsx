import type { BandPosition } from '../types/market';

interface PositionScaleProps {
  position: BandPosition | null;
  label: string;
}

export function PositionScale({ position, label }: PositionScaleProps) {
  if (!position) {
    return (
      <div className="position-block">
        <div className="position-block__label"><span>{label}</span><strong>--</strong></div>
        <p className="muted">轨道重合或历史数据不足，暂不可计算</p>
      </div>
    );
  }
  const raw = Number(position.percent);
  const clamped = Math.max(0, Math.min(100, raw));
  return (
    <div className="position-block">
      <div className="position-block__label">
        <span>{label}</span>
        <strong>{raw.toFixed(1)}% · {position.label}</strong>
      </div>
      <div className="position-scale" aria-label={`${label} ${raw.toFixed(1)}% ${position.label}`}>
        <span className="position-scale__track" />
        <span className="position-scale__middle" />
        <span className="position-scale__pointer" style={{ left: `${clamped}%` }} />
      </div>
      <div className="position-scale__legend"><span>下轨 0%</span><span>中轨 50%</span><span>上轨 100%</span></div>
      {position.segmentProgress && <p className="muted">当前区间内进度 {Number(position.segmentProgress).toFixed(1)}%</p>}
    </div>
  );
}
