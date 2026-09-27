/**
 * يولّد src/views/icons.gen.ts من مكتبة Lucide (ISC) — فقط الأيقونات المستخدمة، مضمّنة في الكود.
 * لماذا مضمّنة؟ صفر طلبات شبكة، تُرسم من الخادم فوراً، وترث اللون (currentColor) ومقاسها من CSS.
 * الاستخدام: node scripts/gen-icons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'

const NAMES = `
house layout-dashboard radio radio-tower calendar-days calendar-clock calendar-plus book-open presentation backpack video video-off
inbox wallet hand-coins receipt building-2 messages-square message-circle notebook-pen clapperboard banknote credit-card clock users
users-round user user-plus circle-check circle-x circle-alert hourglass paperclip x triangle-alert search lightbulb download upload
play circle-play monitor-play square circle-dot ban shield-check eye printer chart-column chart-pie trending-up trending-down bell bell-ring
coffee wifi-off plus chevron-left chevron-right chevron-down log-out menu moon sun sparkles arrow-left arrow-right arrow-up-right mic camera
hand star zap target trophy graduation-cap lock settings command send pencil trash-2 file-text check info phone mail quote rocket heart
list-checks refresh-cw external-link copy key-round door-open smartphone laptop tablet layers timer badge-check crown flame percent
filter archive file-down sliders-horizontal globe book-marked brain calculator atom flask-conical languages pen-tool school
party-popper circle-help message-square-quote shield eye-off fingerprint scan-face wand-sparkles
rewind monitor-smartphone hand-heart heart-handshake award mouse-pointer-click chart-no-axes-combined sigma
`.trim().split(/\s+/)

const out = {}
for (const n of NAMES) {
  const svg = readFileSync(new URL(`../node_modules/lucide-static/icons/${n}.svg`, import.meta.url), 'utf8')
  const inner = svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/\s*\n\s*/g, '')
    .trim()
  if (!inner) throw new Error(`empty icon ${n}`)
  out[n] = inner
}

const body = `// ⚠️ ملف مولّد تلقائياً — لا تعدله يدوياً. شغّل: node scripts/gen-icons.mjs
// Icons: Lucide (https://lucide.dev) — ISC License
export const ICONS = ${JSON.stringify(out, null, 0).replace(/","/g, '",\n  "').replace(/^\{/, '{\n  ').replace(/\}$/, ',\n}')} as const
export type IconName = keyof typeof ICONS
`
writeFileSync(new URL('../src/views/icons.gen.ts', import.meta.url), body)
console.log(`icons.gen.ts: ${NAMES.length} icons, ${(body.length / 1024).toFixed(1)}KB`)
