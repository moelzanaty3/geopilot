// The hero's survey map: contour lines, and one route traced across them to the
// source location a finding resolved to. Generated rather than an asset, so the
// lines take the theme's colours and need no image request.
const CENTER_X = 1060;
const CENTER_Y = 160;
const RINGS = [70, 120, 170, 225, 280, 340, 400, 465, 530, 600, 675];
const POINTS = 96;

function ring(radius: number) {
  const points = Array.from({ length: POINTS }, (_, i) => {
    const angle = (i / POINTS) * Math.PI * 2;
    const wobble = 1 + 0.15 * Math.sin(3 * angle + radius * 0.012) + 0.07 * Math.sin(5 * angle - radius * 0.021) + 0.025 * Math.sin(9 * angle + 1);
    const x = CENTER_X + radius * wobble * 1.3 * Math.cos(angle);
    const y = CENTER_Y + radius * wobble * 0.82 * Math.sin(angle);
    return `${Math.round(x)} ${Math.round(y)}`;
  });
  return `M${points.join('L')}Z`;
}

export function Contours() {
  return (
    <div className="contours" aria-hidden="true">
      <svg viewBox="0 0 1400 720" preserveAspectRatio="xMaxYMin slice">
        <g className="contour-lines">
          {RINGS.map((radius) => (
            <path key={radius} d={ring(radius)} />
          ))}
        </g>
        <path className="route-line" pathLength={1} d="M1385 505 C1280 490 1235 400 1165 350 S1085 240 1062 152" />
        <circle className="route-node" cx="1385" cy="505" r="5" />
        <circle className="route-node" cx="1165" cy="350" r="5" />
        <circle className="route-end" cx="1062" cy="152" r="8" />
        <text className="route-label" x="1084" y="148">
          app/pricing/page.tsx:5
        </text>
      </svg>
    </div>
  );
}
