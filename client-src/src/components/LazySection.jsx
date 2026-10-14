import { useEffect, useRef, useState } from 'react';

// Mounts its children (and so fires their data requests) only once the spot is
// about to scroll into view. Below-the-fold sections on a record page -- audit
// trail, tasks, documents -- otherwise each cost a ~0.8 s round trip up front,
// queueing behind the data the page actually needs to show first.
export default function LazySection({ children, minHeight = 120 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return undefined;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '400px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  return visible ? children : <div ref={ref} style={{ minHeight }} />;
}
