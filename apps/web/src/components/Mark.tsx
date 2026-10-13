/** Het KERN-merkteken uit het v0-ontwerp. */
export function Mark({ small = false }: { small?: boolean }) {
  return <span className={small ? "kern-mark kern-mark-small" : "kern-mark"} aria-hidden="true"><span /></span>;
}
