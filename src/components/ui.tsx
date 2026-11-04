// Brand mark shared by the sign-in screens.
export function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark ${small ? "small" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 40 40">
        <g fill="currentColor" transform="translate(20 20)">
          <ellipse rx="5.2" ry="18" />
          <ellipse rx="5.2" ry="18" transform="rotate(60)" />
          <ellipse rx="5.2" ry="18" transform="rotate(120)" />
          <circle r="5" fill="var(--paper)" />
        </g>
      </svg>
    </span>
  );
}
