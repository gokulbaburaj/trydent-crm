/**
 * Compatibility shim — do not delete.
 *
 * The @bklit registry generates `charts/chart-loading-label.tsx` with
 * `import { ShimmeringText } from "../components/shimmering-text"`, which
 * resolves to THIS path (src/components/components/…) rather than the real
 * component at src/components/shimmering-text.tsx.
 *
 * Patching the generated file works until the next `npx shadcn@latest add
 * @bklit/*` overwrites it — which already broke the build once. Re-exporting
 * here makes that import resolve permanently, whatever the CLI writes.
 */
export { ShimmeringText, type ShimmeringTextProps } from "@/components/shimmering-text";
