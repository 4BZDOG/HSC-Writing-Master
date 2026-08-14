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
 */
const MeshOverlay = ({
  opacity = 'opacity-[0.03]',
  color = '%23ffffff',
}: {
  opacity?: string;
  color?: string;
}) => (
  <div
    className={`absolute inset-0 ${opacity} light:opacity-[0.06] pointer-events-none mix-blend-overlay z-0 transition-all duration-700 ease-in-out`}
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v10M0 1h10' stroke='${color}' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
    }}
  />
);

export default MeshOverlay;
