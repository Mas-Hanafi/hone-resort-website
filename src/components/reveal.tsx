import { useState, useEffect, useRef } from 'react';

type _ObsCb = (visible: boolean) => void;
const _obsCbs = new WeakMap<Element, _ObsCb>();
let _sharedObs: IntersectionObserver | null = null;

export function _getObs() {
  if (!_sharedObs && typeof window !== 'undefined') {
    _sharedObs = new IntersectionObserver(
      (entries) => entries.forEach(e => _obsCbs.get(e.target)?.(e.isIntersecting)),
      { rootMargin: '-5% 0px' }
    );
  }
  return _sharedObs;
}

export function _observe(el: Element, cb: _ObsCb) {
  _obsCbs.set(el, cb);
  _getObs()?.observe(el);
  return () => { _obsCbs.delete(el); _getObs()?.unobserve(el); };
}

const revealVariants: Record<string, { hidden: any; visible: any }> = {
  fadeUp:    { hidden: { opacity: 0, transform: 'translateY(50px)' },   visible: { opacity: 1, transform: 'translateY(0)' } },
  fadeIn:    { hidden: { opacity: 0 },                                    visible: { opacity: 1 } },
  zoomIn:    { hidden: { opacity: 0, transform: 'scale(0.85)' },         visible: { opacity: 1, transform: 'scale(1)' } },
  slideLeft: { hidden: { opacity: 0, transform: 'translateX(-60px)' },   visible: { opacity: 1, transform: 'translateX(0)' } },
  slideRight:{ hidden: { opacity: 0, transform: 'translateX(60px)' },    visible: { opacity: 1, transform: 'translateX(0)' } },
  blur:      { hidden: { opacity: 0, transform: 'translateY(20px)' },    visible: { opacity: 1, transform: 'translateY(0)' } },
};

export function ScrollReveal({ children, variant = 'fadeUp', delay = 0, duration = 0.8, once = true, className = '', as = 'div', id }: any) {
  const Tag = as;
  const ref = useRef<Element>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return _observe(el, (visible) => {
      if (visible) { setIsVisible(true); if (once) _getObs()?.unobserve(el); }
      else if (!once) setIsVisible(false);
    });
  }, [once]);

  const style = {
    ...revealVariants[variant][isVisible ? 'visible' : 'hidden'],
    transition: `all ${duration}s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}s`,
    willChange: isVisible ? 'auto' : 'opacity, transform',
  };

  return <Tag id={id} ref={ref} className={className} style={style}>{children}</Tag>;
}

export function WordReveal({ text, className = '', delay = 0, duration = 0.6, stagger = 0.08, as = 'h2' }: any) {
  const Tag = as;
  const ref = useRef<Element>(null);
  const [isVisible, setIsVisible] = useState(false);
  const words = (text as string).split(' ');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return _observe(el, (visible) => {
      if (visible) { setIsVisible(true); _getObs()?.unobserve(el); }
    });
  }, []);

  return (
    <Tag ref={ref} className={className} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25em' }}>
      {words.map((word: string, i: number) => (
        <span key={i} style={{ overflow: 'hidden', display: 'inline-block' }}>
          <span style={{
            display: 'inline-block',
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? 'translateY(0%)' : 'translateY(100%)',
            transition: `opacity ${duration}s ease, transform ${duration}s cubic-bezier(0.22,1,0.36,1) ${delay + i * stagger}s`,
          }}>{word}</span>
        </span>
      ))}
    </Tag>
  );
}
