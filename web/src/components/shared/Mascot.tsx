import { cn } from '@/lib/utils';

/* "Chip" — linh vật IC3: con chip máy tính, vẽ tay bằng vài hình khối phẳng.
   Chỉ dùng 3 màu của sảnh (--step-1/2/3) + màu chữ; không gradient, không bóng, không animation.
   Dùng ở lời chào và màn hình trống/lỗi — KHÔNG rải khắp giao diện. */

export type MascotMood = 'happy' | 'idle' | 'oops';

const PINS = [34, 52, 70];

export function Mascot({
  mood = 'happy',
  size = 96,
  className,
  title,
}: {
  mood?: MascotMood;
  size?: number;
  className?: string;
  /** Có title → đọc được bằng trình đọc màn hình; không có → trang trí (aria-hidden). */
  title?: string;
}) {
  const led = mood === 'oops' ? 'var(--step-3)' : 'var(--step-2)';
  const look = mood === 'idle' ? 3 : 0;
  return (
    <svg
      viewBox="0 0 112 112"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {/* chân chip */}
      <g fill="var(--muted-foreground)" opacity="0.55">
        {PINS.map((p) => (
          <g key={p}>
            <rect x={p} y="8" width="8" height="14" rx="2" />
            <rect x={p} y="90" width="8" height="14" rx="2" />
            <rect x="8" y={p} width="14" height="8" rx="2" />
            <rect x="90" y={p} width="14" height="8" rx="2" />
          </g>
        ))}
      </g>
      {/* thân */}
      <rect x="18" y="18" width="76" height="76" rx="16" fill="var(--step-1)" />
      {/* màn hình mặt */}
      <rect x="28" y="32" width="56" height="40" rx="9" fill="#ffffff" />
      {/* mắt */}
      <circle cx={46 + look} cy="49" r="4.5" fill="#0f172a" />
      <circle cx={66 + look} cy="49" r="4.5" fill="#0f172a" />
      {/* miệng */}
      {mood === 'happy' && (
        <path d="M47 59 q9 8 18 0" fill="none" stroke="#0f172a" strokeWidth="3.5" strokeLinecap="round" />
      )}
      {mood === 'idle' && <path d="M49 61 h14" stroke="#0f172a" strokeWidth="3.5" strokeLinecap="round" />}
      {mood === 'oops' && <circle cx="56" cy="61" r="3.8" fill="none" stroke="#0f172a" strokeWidth="3.2" />}
      {/* đèn trạng thái + đường mạch */}
      <circle cx="80" cy="83" r="4" fill={led} />
      <path d="M30 83 h18 l5 -5 h9" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
