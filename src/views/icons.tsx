import { raw } from 'hono/html'
import { ICONS, type IconName } from './icons.gen'

export type { IconName }

/**
 * أيقونة SVG مضمّنة (Lucide) — ترث اللون من النص، ومقاسها من CSS (1.15em افتراضياً).
 * aria-hidden افتراضياً لأنها زخرفية بجانب نص؛ مرّر label عندما تكون الأيقونة وحدها.
 */
export function Icon({ name, size, label, class: cls, stroke }: { name: IconName; size?: number; label?: string; class?: string; stroke?: number }) {
  const style = size ? `width:${size}px;height:${size}px` : undefined
  return (
    <svg
      class={`i${cls ? ` ${cls}` : ''}`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={stroke ?? 2}
      stroke-linecap="round"
      stroke-linejoin="round"
      style={style}
      aria-hidden={label ? undefined : 'true'}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      {raw(ICONS[name])}
    </svg>
  )
}

/** أيقونة داخل مربع ملوّن (للبطاقات والقوائم) */
export const IconTile = ({ name, tone = 'brand', size = 'md' }: { name: IconName; tone?: Tone; size?: 'sm' | 'md' | 'lg' }) => (
  <span class={`tile tile-${size} tone-${tone}`}>
    <Icon name={name} />
  </span>
)

export type Tone = 'brand' | 'ok' | 'bad' | 'warn' | 'info' | 'teal' | 'gray' | 'pink'
