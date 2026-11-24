import { useEffect, useRef } from 'react';
import { Splide, SplideSlide } from '@splidejs/react-splide';
import '@splidejs/react-splide/css/core';

const getThumbUrl = (url: string) => url ? url.replace(/\.(jpeg|jpg|png)$/i, 'l.$1') : url;

type PkgItem = { id: string; title: string; img: string; desc: string };
type GalItem = { id: string; category: string; image: string } | undefined;

export function SplideExperiencesCarousel({ items, onOpenDetail }: { items: PkgItem[]; onOpenDetail: (id: string) => void }) {
  const splideRef = useRef<any>(null);

  useEffect(() => {
    const splide = splideRef.current?.splide;
    if (!splide) return;
    function updateSlideClasses(newIndex?: number) {
      const SlidesComp = splide.Components.Slides;
      const slides = SlidesComp.get();
      const total = slides.length;
      const current = newIndex !== undefined ? newIndex : splide.index;
      slides.forEach((S: any) => S.slide.classList.remove('exp-prev', 'exp-next', 'exp-center'));
      const center = SlidesComp.getAt(current);
      if (center) center.slide.classList.add('exp-center');
      for (let i = 1; i <= 2; i++) {
        const prevSlide = SlidesComp.getAt((current - i + total) % total);
        const nextSlide = SlidesComp.getAt((current + i) % total);
        if (prevSlide) prevSlide.slide.classList.add('exp-prev');
        if (nextSlide) nextSlide.slide.classList.add('exp-next');
      }
    }
    splide.on('mounted', () => updateSlideClasses());
    splide.on('moved', (newIndex: number) => updateSlideClasses(newIndex));
    if (splide.Components.Slides) updateSlideClasses();
    splide.on('click', (slide: any) => {
      if (slide.index === splide.index) {
        const pkg = items[slide.index];
        if (pkg) onOpenDetail(pkg.id);
      }
    });
  }, [items, onOpenDetail]);

  return (
    <div className="relative select-none w-full pb-12 overflow-x-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        .exp-splide .splide__track { padding: 24px 0 56px !important; overflow: visible !important; }
        .exp-splide .splide__list { align-items: center; }
        .exp-splide .splide__slide { transition: transform 0.8s cubic-bezier(0.25,1,0.5,1), opacity 0.6s ease; transform: scale(0.82); transform-origin: center center; opacity: 0.65; cursor: default; }
        .exp-splide .splide__slide.exp-center { transform: scale(1); opacity: 1; cursor: pointer; }
        .exp-splide .splide__slide .exp-card-inner { height: 460px; outline: none; transition: outline 0.4s ease; pointer-events: none; user-select: none; }
        .exp-splide .splide__slide.exp-center .exp-card-inner { outline: 2px solid rgba(212,175,55,0.4); outline-offset: 4px; pointer-events: auto; }
        .exp-splide .splide__slide .exp-overlay { opacity: 0; transition: opacity 0.8s ease; }
        .exp-splide .splide__slide.exp-center .exp-overlay { opacity: 1; }
        .exp-splide .splide__pagination { bottom: 0; }
        .exp-splide .splide__pagination__page { width: 8px; height: 8px; background: #d4d4d4; border-radius: 9999px; transition: all 0.3s ease; margin: 0 4px; opacity: 1; }
        .exp-splide .splide__pagination__page.is-active { width: 24px; background: #D4AF37; transform: none; }
        @media (max-width: 640px) {
          .exp-splide .splide__track { overflow: hidden !important; padding: 8px 0 56px !important; }
          .exp-splide .splide__slide { transform: scale(1) !important; opacity: 1 !important; }
          .exp-splide .splide__slide .exp-card-inner { height: auto !important; aspect-ratio: 3/4; pointer-events: auto; }
          .exp-splide .splide__slide .exp-overlay { opacity: 1 !important; }
          .exp-splide .splide__slide.exp-center .exp-card-inner { outline: none; }
        }
      `}} />
      <Splide ref={splideRef} className="exp-splide" options={{ type:'loop', perPage:3, focus:'center', autoplay:false, flickMaxPages:3, updateOnMove:true, pagination:true, arrows:false, speed:1500, padding:'8%', throttle:300, breakpoints:{ 1440:{perPage:3,padding:'8%'}, 1280:{perPage:2,padding:'16%'}, 1024:{perPage:2,padding:'0%'}, 800:{perPage:2,padding:'0%'}, 640:{perPage:1,padding:'8%'} } }}>
        {items.map((pkg) => (
          <SplideSlide key={pkg.id}>
            <div className="exp-card-inner relative overflow-hidden rounded-[8px] md:rounded-[16px] shadow-2xl ring-1 ring-white/20">
              <img loading="lazy" decoding="async" src={pkg.img || getThumbUrl((pkg as any).image)} alt={pkg.title} className={`w-full h-full object-cover ${pkg.id==='floating'?'object-[50%_75%]':pkg.id==='cake'?'object-[50%_85%]':'object-center'}`} />
              <div className="exp-overlay absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
              <div className="exp-overlay absolute inset-0 flex flex-col justify-end p-6 md:p-8">
                <h3 className="text-white font-serif uppercase tracking-widest mb-2 text-base drop-shadow-md">{pkg.title}</h3>
                <p className="text-neutral-100 text-xs line-clamp-2 leading-relaxed mb-4 drop-shadow-md">{pkg.desc}</p>
                <span className="text-[#D4AF37] text-[9px] font-bold uppercase tracking-[0.3em] drop-shadow-md">Signature Experience</span>
              </div>
            </div>
          </SplideSlide>
        ))}
      </Splide>
    </div>
  );
}

export function SplideGalleryCarousel({ items, onOpenItem }: { items: GalItem[]; onOpenItem: (item: any) => void }) {
  const splideRef = useRef<any>(null);

  useEffect(() => {
    const splide = splideRef.current?.splide;
    if (!splide) return;
    function updateSlideClasses(newIndex?: number) {
      const SlidesComp = splide.Components.Slides;
      const slides = SlidesComp.get();
      const total = slides.length;
      const current = newIndex !== undefined ? newIndex : splide.index;
      slides.forEach((S: any) => S.slide.classList.remove('gal-prev', 'gal-next', 'gal-center'));
      const center = SlidesComp.getAt(current);
      if (center) center.slide.classList.add('gal-center');
      for (let i = 1; i <= 2; i++) {
        const prevSlide = SlidesComp.getAt((current - i + total) % total);
        const nextSlide = SlidesComp.getAt((current + i) % total);
        if (prevSlide) prevSlide.slide.classList.add('gal-prev');
        if (nextSlide) nextSlide.slide.classList.add('gal-next');
      }
    }
    splide.on('mounted', () => updateSlideClasses());
    splide.on('moved', (newIndex: number) => updateSlideClasses(newIndex));
    if (splide.Components.Slides) updateSlideClasses();
    splide.on('click', (slide: any) => {
      if (slide.index === splide.index) { const item = items[slide.index]; if (item) onOpenItem(item); }
    });
  }, [items, onOpenItem]);

  return (
    <div className="relative select-none w-full pb-12 overflow-x-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        .gal-splide .splide__track { padding: 24px 0 56px !important; overflow: visible !important; }
        .gal-splide .splide__list { align-items: center; }
        .gal-splide .splide__slide { transition: transform 0.8s cubic-bezier(0.25,1,0.5,1), opacity 0.6s ease; transform: scale(0.82); transform-origin: center center; opacity: 0.65; cursor: default; }
        .gal-splide .splide__slide.gal-center { transform: scale(1); opacity: 1; cursor: pointer; }
        .gal-splide .splide__slide .gal-card-inner { height: 460px; outline: none; transition: outline 0.4s ease; pointer-events: none; user-select: none; }
        .gal-splide .splide__slide.gal-center .gal-card-inner { outline: 2px solid rgba(212,175,55,0.4); outline-offset: 4px; pointer-events: auto; }
        .gal-splide .splide__slide .gal-overlay { opacity: 0; transition: opacity 0.8s ease; }
        .gal-splide .splide__slide.gal-center .gal-overlay { opacity: 1; }
        .gal-splide .splide__pagination { bottom: 0; }
        .gal-splide .splide__pagination__page { width: 8px; height: 8px; background: #555; border-radius: 9999px; transition: all 0.3s ease; margin: 0 4px; opacity: 1; }
        .gal-splide .splide__pagination__page.is-active { width: 24px; background: #D4AF37; transform: none; }
        @media (max-width: 640px) {
          .gal-splide .splide__track { overflow: hidden !important; padding: 8px 0 56px !important; }
          .gal-splide .splide__slide { transform: scale(1) !important; opacity: 1 !important; }
          .gal-splide .splide__slide .gal-card-inner { height: auto !important; aspect-ratio: 3/4; pointer-events: auto; }
          .gal-splide .splide__slide .gal-overlay { opacity: 1 !important; }
          .gal-splide .splide__slide.gal-center .gal-card-inner { outline: none; }
        }
      `}} />
      <Splide ref={splideRef} className="gal-splide" options={{ type:'loop', perPage:3, focus:'center', autoplay:false, flickMaxPages:3, updateOnMove:true, pagination:true, arrows:false, speed:1500, padding:'8%', throttle:300, breakpoints:{ 1440:{perPage:3,padding:'8%'}, 1280:{perPage:2,padding:'16%'}, 1024:{perPage:2,padding:'0%'}, 800:{perPage:2,padding:'0%'}, 640:{perPage:1,padding:'8%'} } }}>
        {items.map((item) => item && (
          <SplideSlide key={item.id}>
            <div className="gal-card-inner relative overflow-hidden rounded-[8px] md:rounded-[16px] shadow-2xl ring-1 ring-white/10">
              <img loading="lazy" decoding="async" src={item.image.replace('q_auto,w_800', 'q_50,w_400')} alt={`H One Resort - ${item.category}`} className="w-full h-full object-cover" />
              <div className="gal-overlay absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="gal-overlay absolute inset-0 flex flex-col justify-end p-6 md:p-8">
                <span className="text-[#D4AF37] text-[9px] font-bold uppercase tracking-[0.3em] drop-shadow-md">{item.category}</span>
              </div>
            </div>
          </SplideSlide>
        ))}
      </Splide>
    </div>
  );
}

export function GalleryCard({ item, onClick }: { item: any; onClick: (item: any) => void }) {
  const photoNumber = Number(String(item.id).split('-').pop()) + 1;
  const altText = `H One Resort - ${item.category} - Foto ${photoNumber}`;
  return (
    <div role="button" tabIndex={0} aria-label={`View ${item.category} photo ${photoNumber}`} className="relative overflow-hidden rounded-lg cursor-pointer group shadow-md break-inside-avoid mb-6" onClick={() => onClick(item)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(item); }}>
      <img src={item.image.replace('q_auto,w_800', 'q_auto,w_500')} alt={altText} loading="lazy" decoding="async" className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-110" />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-500" />
    </div>
  );
}

export function GalleryLightbox({ item, onClose, onPrev, onNext }: { item: any; onClose: () => void; onPrev: () => void; onNext: () => void }) {
  if (!item) return null;
  return (
    <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={onClose}>
      <div className="relative max-w-6xl w-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <img src={item.image} alt={`H One Resort - ${item.category} - Foto ${Number(String(item.id).split('-').pop()) + 1}`} className="max-w-full max-h-[85vh] object-contain shadow-2xl rounded-sm" />
        <button aria-label="Close lightbox" onClick={onClose} className="absolute -top-14 right-0 md:-top-6 md:-right-6 w-10 h-10 bg-white/10 text-white rounded-full flex items-center justify-center hover:bg-black transition-colors text-xl focus-ring z-10">✕</button>
        <button aria-label="Previous photo" onClick={onPrev} className="absolute left-2 md:-left-12 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 text-white rounded-full flex items-center justify-center hover:bg-black transition-colors text-lg focus-ring z-10">‹</button>
        <button aria-label="Next photo" onClick={onNext} className="absolute right-2 md:-right-12 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 text-white rounded-full flex items-center justify-center hover:bg-black transition-colors text-lg focus-ring z-10">›</button>
      </div>
    </div>
  );
}
