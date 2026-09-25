export type BrightnessFadeStep = { brightness: number; offsetMs: number };

function clampBrightness(value: number, minimum: number, maximum: number) {
  if (value <= 0) return 0;
  return Math.min(maximum, Math.max(minimum, value));
}

export function buildBrightnessFadeSteps(input: {
  start: number;
  target: number;
  minimum: number;
  maximum: number;
  durationMs: number;
}): BrightnessFadeStep[] {
  const minimum = Math.max(0, Math.min(100, Math.round(input.minimum)));
  const maximum = Math.max(minimum, Math.min(100, Math.round(input.maximum)));
  const start = clampBrightness(Math.round(input.start), minimum, maximum);
  const target = clampBrightness(Math.round(input.target), minimum, maximum);
  const durationMs = Math.max(0, Math.min(300_000, Math.round(input.durationMs)));
  if (!durationMs || start === target) return [{ brightness: target, offsetMs: 0 }];
  const steps = Math.min(12, Math.max(1, Math.min(Math.ceil(durationMs / 1000), Math.abs(target - start))));
  return Array.from({ length: steps }, (_, index) => {
    const progress = (index + 1) / steps;
    return {
      brightness: clampBrightness(Math.round(start + (target - start) * progress), minimum, maximum),
      offsetMs: Math.round(durationMs * progress),
    };
  });
}
