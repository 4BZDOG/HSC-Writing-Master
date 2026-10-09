/**
 * The cubic mesh texture that sits over a surface to stop it reading as flat
 * paint. Absolutely positioned, so the parent needs `relative` and usually
 * `overflow-hidden`.
 *
 * `color` exists because the strokes are drawn into an inline SVG data URI and
 * cannot be recoloured from a class. It defaults to white, which is invisible
 * on a white surface — hence `light:opacity-[0.06]`, which lifts the texture
 * far enough to survive the light theme. Pass a darker `color` when the mesh
 * needs to read on a pale surface in either theme.
 *
 * `plain` is for a surface that is animating or sits next to one. The default
 * texture is drawn with `mix-blend-mode: overlay`, and a blend mode makes the
 * browser render everything beneath it into an offscreen group and blend it back
 * — every frame that anything under it changes. Safari pays that in dropped
 * frames, and the verb ribbon, which fades, rises and cross-fades light across
 * its whole stage, is exactly where it was felt. A plain overlay is the same
 * strokes at a plain alpha: no blend, no `transition-all`, the same in both
 * themes (the surfaces that ask for it do not flip), and rounded to its parent
 * so it clips itself instead of relying on a composited ancestor to do it.
 */
const MeshOverlay = ({
  opacity = 'opacity-[0.03]',
  color = '%23ffffff',
  plain = false,
  darkOnly = false,
  box = 'inset-0',
}: {
  opacity?: string;
  color?: string;
  plain?: boolean;
  /** Draw it in the dark theme only. The strokes are white, and white strokes on
   *  a light ground paint nothing at all — so on a surface that is light in the
   *  light theme the layer is pure cost, and this takes it out of the tree
   *  (`display: none`) rather than leaving an invisible one to be composited. */
  darkOnly?: boolean;
  /** Where the overlay sits, as Tailwind position and size. `inset-0` (the
   *  parent's whole box) unless the parent's size changes while it is on
   *  screen: a texture that tracks a resizing box is re-painted on every frame
   *  of the resize, and one given a fixed size is painted once and merely
   *  revealed — see the verb ribbon's panel. */
  box?: string;
}) => (
  <div
    className={
      plain
        ? `absolute ${box} ${opacity} rounded-[inherit] pointer-events-none z-0${darkOnly ? ' hidden dark:block' : ''}`
        : `absolute inset-0 ${opacity} light:opacity-[0.06] pointer-events-none mix-blend-overlay z-0 transition-all duration-700 ease-in-out`
    }
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v10M0 1h10' stroke='${color}' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
    }}
  />
);

export default MeshOverlay;
