import { useEffect, useRef, useState } from 'react';

/** Observe when an element enters the viewport (infinite scroll sentinels, lazy video). */
export function useInView<T extends Element>(
  options: IntersectionObserverInit = { rootMargin: '600px 0px' },
) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const { root, rootMargin, threshold } = options;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setInView(!!entry?.isIntersecting), {
      root,
      rootMargin,
      threshold,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [root, rootMargin, threshold]);
  return { ref, inView };
}
