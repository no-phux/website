/** A soft, bounded look vector; distant pointers never pull an eye out of its socket. */
export function gazeOffset(dx: number, dy: number) {
  const distance = Math.hypot(dx, dy, 160);
  return { x: dx / distance * 3.2, y: dy / distance * 2.2 };
}

/** Time-based damping keeps the same response on 60Hz and 120Hz displays. */
export function gazeBlend(elapsed: number) {
  return 1 - Math.exp(-Math.min(elapsed, 50) / 65);
}
