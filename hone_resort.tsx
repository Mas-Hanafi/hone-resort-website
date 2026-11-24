import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import pageMetaData from './src/seo/page-meta.json';
import Lenis from 'lenis';
import { ScrollReveal, WordReveal } from './src/components/reveal';
import {
  Menu, X, Calendar, Users, MapPin, Phone, Mail,
  ChevronRight, ChevronLeft, Anchor, Coffee, Utensils, Image as ImageIcon,
  BedDouble, Maximize, Eye, ArrowRight, Plus, Minus, ChevronDown,
  PlayCircle, Check, Map as MapIcon, ExternalLink,
  Wifi, Waves, Car, Store, CreditCard, Sun, Bath, Home, Trees, ArrowUpRight, Star, Flame
} from 'lucide-react';
import 'react-day-picker/style.css';
import { DayDataContext, PriceDayButton, useHariLibur, dpLocale, scarcityText } from './src/calendarDay';
import { useLang, LangSwitch } from './src/lang';
import { alternatives, canCheckIn, canCheckOut, roomsLeft, type Alternative, type Night, type NightOf } from './src/stay';
import RoomAlternatives from './src/components/RoomAlternatives';

const DAY_COMPONENTS = { DayButton: PriceDayButton };
const DayPicker = lazy(() => import('react-day-picker').then(m => ({ default: m.DayPicker })));
const PricelistCalendar = lazy(() => import('./src/pages/PricelistCalendar'));

const SplideExperiencesCarousel = lazy(() =>
  import('./src/components/carousels').then(m => ({ default: m.SplideExperiencesCarousel }))
);
const SplideGalleryCarousel = lazy(() =>
  import('./src/components/carousels').then(m => ({ default: m.SplideGalleryCarousel }))
);
const GalleryCard = lazy(() =>
  import('./src/components/carousels').then(m => ({ default: m.GalleryCard }))
);
const GalleryLightbox = lazy(() =>
  import('./src/components/carousels').then(m => ({ default: m.GalleryLightbox }))
);

const RoomsPage = lazy(() => import('./src/pages/RoomsPage'));
const MeetingsPage = lazy(() => import('./src/pages/MeetingsPage'));
const PackageDetailPage = lazy(() => import('./src/pages/PackageDetailPage'));

// Behold.so Instagram widget custom element type
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'behold-widget': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { 'feed-id': string };
    }
  }
}

const Instagram = ({ size = 24, className = '', ...props }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
  </svg>
);

const Facebook = ({ size = 24, className = '', ...props }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
  </svg>
);

const TiktokIcon = ({ size = 24, className = "" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
  </svg>
);

const WhatsAppIcon = ({ size = 24, className = "" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

// === 1. NATIVE SMOOTH SCROLL HOOK ===
function useLenis() {
  useEffect(() => {
    if (window.innerWidth < 768) return;

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
      cancelAnimationFrame(rafId);
    };
  }, []);
}

// === 4. FOOD SLIDESHOW COMPONENT (3D Perspective Carousel) ===
function FoodSlideshow({ images }: { images: { src: string; alt: string }[] }) {
  const { tr } = useLang();
  const [current, setCurrent] = useState(0);
  const handleNext = useCallback(() => setCurrent(i => (i + 1) % images.length), [images.length]);

  useEffect(() => {
    const t = setInterval(handleNext, 4000);
    return () => clearInterval(t);
  }, [handleNext]);

  return (
    <div
      className="relative w-full h-[350px] md:h-[500px] flex items-center justify-center overflow-hidden bg-transparent rounded-sm"
      style={{ perspective: '1000px' }}
    >
      {images.map((img, index) => {
        const total = images.length;
        let pos = ((index - current) + total) % total;
        if (pos > Math.floor(total / 2)) pos = pos - total;
        const isCenter = pos === 0;
        const isAdjacent = Math.abs(pos) === 1;
        return (
          <div
            key={index}
            className="absolute transition-all duration-500 ease-in-out rounded-2xl overflow-hidden"
            style={{
              width: '68%',
              height: '85%',
              transform: `translateX(${pos * 48}%) scale(${isCenter ? 1 : 0.78}) rotateY(${pos * -14}deg)`,
              zIndex: isCenter ? 10 : isAdjacent ? 5 : 1,
              opacity: isCenter ? 1 : isAdjacent ? 0.45 : 0,
              filter: isCenter ? 'none' : 'blur(4px)',
              visibility: Math.abs(pos) > 1 ? 'hidden' : 'visible',
            }}
          >
            <img loading="lazy" decoding="async" src={img.src} alt={img.alt} width="800" height="600" className="w-full h-full object-cover" />
          </div>
        );
      })}
      {/* Prev/Next */}
      <button aria-label={tr('Gambar sebelumnya', 'Previous image')} onClick={() => setCurrent(i => (i - 1 + images.length) % images.length)} className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors">
        <ChevronLeft size={16} />
      </button>
      <button aria-label={tr('Gambar berikutnya', 'Next image')} onClick={handleNext} className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors">
        <ChevronRight size={16} />
      </button>
      {/* Dots */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
        {images.map((_, i) => (
          <button key={i} aria-label={tr(`Gambar ${i + 1}`, `Image ${i + 1}`)} onClick={() => setCurrent(i)} className={`h-1 rounded-full transition-all duration-300 ${i === current ? 'bg-white w-5' : 'bg-white/40 w-1.5'}`} />
        ))}
      </div>
    </div>
  );
}


// === DATA STATIS ===
const navItems = ['Home', 'Rooms', 'Pricelist', 'Signature Experiences', 'Meetings', 'Gallery'];
// display labels only: the item keys above stay as they are (routing + GA4 event labels)
const NAV_LABELS: Record<string, [string, string]> = {
  'Home': ['Beranda', 'Home'], 'Rooms': ['Kamar', 'Rooms'], 'Pricelist': ['Pricelist', 'Pricelist'],
  'Signature Experiences': ['Signature Experiences', 'Signature Experiences'], 'Meetings': ['Meeting', 'Meetings'], 'Gallery': ['Galeri', 'Gallery'],
};
type Tr = (id: string, en: string) => string;
type LangKey = 'id' | 'en';
// LangSwitch restyled for the transparent (hero) nav
const LANG_ON_DARK = '!bg-white/15 backdrop-blur-sm [&>button:not([aria-pressed=true])]:!text-white/80 [&>button:not([aria-pressed=true])]:hover:!text-white';
// static fallback of the CMS hero subtitle (translated only while it still equals this default)
const HERO_SUB_ID = 'Resort Private Pool di Pantai Contoh, Kabupaten Contoh — private, designed, and always intentional.';
const HERO_SUB_EN = 'Private Pool Resort at H One Beach, Kabupaten Contoh — private, designed, and always intentional.';
const ID_MONTHS_EN: Record<string, string> = { Januari: 'January', Februari: 'February', Maret: 'March', Mei: 'May', Juni: 'June', Juli: 'July', Agustus: 'August', Oktober: 'October', Desember: 'December' };
const periodLabelFor = (label: string, lang: LangKey) =>
  lang === 'en' ? label.replace(/\b(Januari|Februari|Maret|Mei|Juni|Juli|Agustus|Oktober|Desember)\b/g, m => ID_MONTHS_EN[m]) : label;
const REVIEW_MONTH_ID: Record<string, string> = { May: 'Mei', Aug: 'Agu', Oct: 'Okt', Dec: 'Des' };
const reviewDate = (d: string, lang: LangKey) => (lang === 'en' ? d : d.replace(/^(May|Aug|Oct|Dec)/, m => REVIEW_MONTH_ID[m]));

// Fallback data — used if Supabase API unavailable. Update this when doing major period resets.
const fallbackPricelistData = [
  { label: "1–3, 7–10 September", tag: "Weekday September", minCheckIn: "2026-09-01", maxCheckIn: "2026-09-10", sup_sv: "1.250.000", sup_gv: "1.150.000", dlx_sv: "1.370.000", dlx_gv: "1.300.000", suite_sv: "2.300.000",
    checkInDates: ["2026-09-01","2026-09-02","2026-09-03","2026-09-07","2026-09-08","2026-09-09","2026-09-10"] },
  { label: "4–6, 11–13, 18–20, 25–27 September", tag: "Weekend September", minCheckIn: "2026-09-04", maxCheckIn: "2026-09-27", sup_sv: "1.450.000", sup_gv: "1.350.000", dlx_sv: "1.570.000", dlx_gv: "1.490.000", suite_sv: "2.500.000",
    checkInDates: ["2026-09-04","2026-09-05","2026-09-06","2026-09-11","2026-09-12","2026-09-13","2026-09-18","2026-09-19","2026-09-20","2026-09-25","2026-09-26","2026-09-27"] },
  { label: "14–17, 21–24, 28–30 September", tag: "Weekday September", minCheckIn: "2026-09-14", maxCheckIn: "2026-09-30", sup_sv: "1.250.000", sup_gv: "1.150.000", dlx_sv: "1.370.000", dlx_gv: "1.300.000", suite_sv: "2.300.000",
    checkInDates: ["2026-09-14","2026-09-15","2026-09-16","2026-09-17","2026-09-21","2026-09-22","2026-09-23","2026-09-24","2026-09-28","2026-09-29","2026-09-30"] },
  { label: "1, 5–8, 12–15, 19–22, 26–29 Oktober", tag: "Weekday Oktober", minCheckIn: "2026-10-01", maxCheckIn: "2026-10-29", sup_sv: "1.250.000", sup_gv: "1.150.000", dlx_sv: "1.370.000", dlx_gv: "1.300.000", suite_sv: "2.300.000",
    checkInDates: ["2026-10-01","2026-10-05","2026-10-06","2026-10-07","2026-10-08","2026-10-12","2026-10-13","2026-10-14","2026-10-15","2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-26","2026-10-27","2026-10-28","2026-10-29"] },
  { label: "2–4, 9–11, 16–18, 23–25, 30–31 Oktober", tag: "Weekend Oktober", minCheckIn: "2026-10-02", maxCheckIn: "2026-10-31", sup_sv: "1.450.000", sup_gv: "1.350.000", dlx_sv: "1.570.000", dlx_gv: "1.490.000", suite_sv: "2.500.000",
    checkInDates: ["2026-10-02","2026-10-03","2026-10-04","2026-10-09","2026-10-10","2026-10-11","2026-10-16","2026-10-17","2026-10-18","2026-10-23","2026-10-24","2026-10-25","2026-10-30","2026-10-31"] },
  { label: "2–5, 9–12, 16–19, 23–26, 30 November", tag: "Weekday November", minCheckIn: "2026-11-02", maxCheckIn: "2026-11-30", sup_sv: "1.250.000", sup_gv: "1.150.000", dlx_sv: "1.370.000", dlx_gv: "1.300.000", suite_sv: "2.300.000",
    checkInDates: ["2026-11-02","2026-11-03","2026-11-04","2026-11-05","2026-11-09","2026-11-10","2026-11-11","2026-11-12","2026-11-16","2026-11-17","2026-11-18","2026-11-19","2026-11-23","2026-11-24","2026-11-25","2026-11-26","2026-11-30"] },
  { label: "1, 6–8, 13–15, 20–22, 27–29 November", tag: "Weekend November", minCheckIn: "2026-11-01", maxCheckIn: "2026-11-29", sup_sv: "1.450.000", sup_gv: "1.350.000", dlx_sv: "1.570.000", dlx_gv: "1.490.000", suite_sv: "2.500.000",
    checkInDates: ["2026-11-01","2026-11-06","2026-11-07","2026-11-08","2026-11-13","2026-11-14","2026-11-15","2026-11-20","2026-11-21","2026-11-22","2026-11-27","2026-11-28","2026-11-29"] },
];

// Room types with the booking engine off (live site) and on first paint. With the engine on, admin "Kamar"
// decides the list (booking setting `kamar`, loaded in App). code = pricelist_periods field / engine room_code.
const STATIC_ROOMS = [
  { name: "Superior Sea View", code: "sup_sv" },
  { name: "Superior Garden View", code: "sup_gv" },
  { name: "Deluxe Sea View", code: "dlx_sv" },
  { name: "Deluxe Garden View", code: "dlx_gv" },
  { name: "Suite Sea View", code: "suite_sv" },
];
const STATIC_ROOM_FIELD_MAP: Record<string, string> = Object.fromEntries(STATIC_ROOMS.map(r => [r.name, r.code]));
const parsePriceValue = (price?: string): number | undefined =>
  price ? Number(price.replace(/\./g, '')) || undefined : undefined;
const getRoomPriceValue = (period: any, roomType: string): number | undefined =>
  parsePriceValue(period?.[STATIC_ROOM_FIELD_MAP[roomType]]);

const NO_REQUEST = "Tidak Ada";
const requestOptions = [
  NO_REQUEST, "Extra Bed", "Romantic Towel", "Slice of Cake", "Romantic Dinner", "Floating Breakfast", "Rooftop BBQ", "Jeep Adventure", "Bajaj Fun Trip", "Other"
];

// "Tidak Ada" is exclusive: picking it clears the rest, picking anything else drops it.
const toggleRequestOption = (list: string[], opt: string): string[] => {
  if (opt === NO_REQUEST) return list.includes(opt) ? [] : [opt];
  return list.includes(opt) ? list.filter(r => r !== opt) : [...list.filter(r => r !== NO_REQUEST), opt];
};

// Add-ons with a daily quota (whole resort, counted on the check-in date): request label -> addon kode.
const QUOTA_ADDON_CODE: Record<string, string> = { "Bajaj Fun Trip": "bajaj_fun_trip", "Rooftop BBQ": "rooftop_bbq", "Romantic Dinner": "romantic_dinner" };
// state setter that keeps the previous object when the JSON is identical, so a background refresh never re-renders
const setIfChanged = <T,>(set: (fn: (prev: T) => T) => void, next: T) => set(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
const CMS_REFRESH_MS = 30_000;

// Romantic Dinner / Romantic Towel need 2 days of preparation: check-in must be at least today (WIB) + 2 days.
const H2_ADDONS = ["Romantic Dinner", "Romantic Towel"];
const h2Message = (tr: Tr) => tr(
  'Romantic Dinner / Romantic Towel tidak tersedia untuk check-in kurang dari H-2. Silakan pilih "Tidak Ada" atau add-on lain.',
  'Romantic Dinner / Romantic Towel are not available for check-in less than 2 days ahead (H-2). Please choose "None" or another add-on.'
);
const h2Blocked = (requests: string[], checkIn?: string): boolean => {
  if (!checkIn || !requests.some(r => H2_ADDONS.includes(r))) return false;
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()).split('-').map(Number);
  const min = new Date(y, m - 1, d + 2);
  const minStr = `${min.getFullYear()}-${String(min.getMonth() + 1).padStart(2, '0')}-${String(min.getDate()).padStart(2, '0')}`;
  return checkIn < minStr;
};

// One-time pop-up shown when a guest picks one of the H-2 add-ons (closes on backdrop click or Escape).
function AddonH2Modal({ onClose }: { onClose: () => void }) {
  const { tr } = useLang();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 px-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="addon-h2-title" onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-white border border-[#D4AF37]/60 rounded-[10px] p-7 text-center shadow-2xl">
        <h3 id="addon-h2-title" className="font-serif text-[15px] tracking-[0.3em] text-[#8A6D00]">{tr('Informasi Add-on', 'Add-on Information')}</h3>
        <div className="mx-auto mt-3 mb-4 h-px w-12 bg-[#D4AF37]" />
        <p className="font-sans text-[13px] leading-relaxed text-neutral-700">
          {tr('Romantic Dinner dan Romantic Towel membutuhkan persiapan khusus, sehingga hanya dapat dipesan paling lambat H-2 sebelum tanggal check-in.',
            'Romantic Dinner and Romantic Towel require special preparation, so they can only be booked at least 2 days (H-2) before the check-in date.')}
        </p>
        <button type="button" autoFocus onClick={onClose}
          className="mt-6 w-full bg-black text-[#D4AF37] font-bold uppercase tracking-[0.3em] text-[11px] py-3.5 rounded-[8px] hover:bg-[#D4AF37] hover:text-black transition-colors duration-300 touch-action-manipulation active:scale-[0.98] focus-ring">
          {tr('Saya mengerti', 'I understand')}
        </button>
      </div>
    </div>,
    document.body
  );
}

const requestPrices: Record<string, string> = {
  "Extra Bed": "+Rp350.000",
  "Romantic Towel": "+Rp250.000/Setup",
  "Slice of Cake": "+Rp100.000/Slice",
  "Romantic Dinner": "+Rp500.000/Couple",
  "Floating Breakfast": "+Rp350.000",
  "Rooftop BBQ": "+Rp350.000/4Pax",
  "Jeep Adventure": "+Rp350.000/4Pax",
  "Bajaj Fun Trip": "+Rp350.000",
};

const aboutImages = [
  "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_600/https://i.imgur.com/Bu0l9Oi.jpeg", "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_600/https://i.imgur.com/oxMN5GC.jpeg", "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_600/https://i.imgur.com/aIT0IdB.jpg"
];

const roomsData = [
  { name: "Superior Sea View", image: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/ht7F0zP.jpeg", size: "32 m²", bed: "1 King Bed / Twin Bed (Upon request)", tagline: "Where the horizon becomes your most faithful companion.", desc: "Suara ombak adalah satu-satunya alarm yang diizinkan di sini. Cahaya pagi menyebar perlahan di atas permukaan laut — lembut, tanpa tergesa, seperti hari yang mengerti bahwa Anda butuh waktu. Sanctuary ini bukan sekadar kamar dengan sea view. Ia adalah percakapan pribadi antara Anda dan samudra selatan." },
  { name: "Superior Garden View", image: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/oxYbkEw.jpeg", size: "32 m²", bed: "1 King Bed / Twin Bed (Upon request)", tagline: "A private world softened by green and shadow.", desc: "Di balik kanopi tropis yang menaungi, dunia terasa lebih kecil — dan justru di situ, ia terasa lebih utuh. Cahaya menyaring lembut melalui dedaunan di pagi hari; angin membawa aroma tanah basah saat sore menjelang. Untuk mereka yang menemukan kedalaman bukan dalam pemandangan yang luas, melainkan dalam keheningan yang dekat." },
  { name: "Deluxe Sea View", image: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/ocljqF0.jpeg", size: "42 m²", bed: "1 King Bed / Twin Bed (Upon request)", tagline: "An uninterrupted dialogue with the southern sea.", desc: "Ruang yang lebih lapang bukan berarti lebih banyak furnitur — melainkan lebih banyak laut. Panorama pesisir selatan terbentang tanpa hambatan dari setiap sudut sanctuary ini, membiarkan suara ombak, kualitas cahaya, dan pergerakan air menjadi bagian dari ritme harian Anda. Ini bukan sekadar view. Ini adalah immersion." },
  { name: "Deluxe Garden View", image: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/4rS8xBv.jpeg", size: "42 m²", bed: "1 King Bed / Twin Bed (Upon request)", tagline: "Depth, shadow, and an uncommon stillness.", desc: "Ada kemewahan yang tidak perlu panorama luas untuk membuktikan diri. Di sanctuary ini, privasi terasa seperti arsitektur itu sendiri — terbangun dari hijau yang mengelilingi, bayangan yang meneduhkan, dan kesunyian yang tidak pernah terasa kosong. Ruang yang melindungi, bukan sekadar mewadahi." },
  { name: "Suite Sea View", image: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/SKBkcRN.jpeg", size: "65 m²", bed: "1 Super King Bed", tagline: "The most considered space we offer. Nothing left to chance.", desc: "Enam puluh lima meter persegi yang dirancang dengan obsesi terhadap detail — di mana setiap proporsi, setiap sightline, setiap material telah melalui pertimbangan yang panjang. Suite Sea View menguasai panorama pesisir terluas di resort ini — bukan sebagai pamer, melainkan sebagai pernyataan tentang apa yang Anda layak rasakan. Untuk mereka yang tahu perbedaannya." }
];

const packageDetailsData = {
  jeep: { title: "H One Jeep Adventure", subtitle: "Signature Experience", heroImg: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/MNq2vF7.jpeg", description: "Pesisir selatan punya rute yang hanya dikenal oleh mereka yang mau melambat cukup lama untuk menemukannya. Perjalanan eksploratif menyusuri lanskap H One — bukan untuk tergesa-gesa, melainkan untuk benar-benar melihat.", includes: ["Sewa armada Jeep eksklusif", "Pengemudi profesional / guide", "Pilihan Rute A: H One - Puncak Krakal - Sarangan - Slili", "Pilihan Rute B: H One - Watu Kodok - Sepanjang - Nglolang", "Kapasitas 4 orang per Jeep (4 Pax)"], price: "Rp 350.000 / 4 Pax" },
  bajaj: { title: "Coastal Bajaj Fun Trip", subtitle: "Signature Experience", heroImg: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/6NqMxmV.jpeg", description: "Cara paling estetik untuk mengenal kawasan H One dari perspektif yang berbeda. Sebuah perjalanan santai yang dirancang sebagai cara menikmati waktu — bukan sebagai itinerary yang harus diselesaikan.", includes: ["Armada Bajaj eksklusif", "Pengemudi lokal yang berpengalaman", "Rute perjalanan: H One - Slili - Sadranan", "Kapasitas ideal untuk menikmati perjalanan santai"], price: "Rp 350.000" },
  bbq: { title: "Rooftop BBQ Experience", subtitle: "Signature Experience", heroImg: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/l7TWFGd.jpg", description: "Angin laut, langit terbuka, dan bara yang menyala perlahan — private BBQ di rooftop ini dirancang untuk mereka yang mengerti bahwa perayaan terbaik tidak membutuhkan kebisingan.", includes: ["Main Course: French Fries / Steamed Rice, Satay Skewers, Smoked Beef, Chicken Slices, Dumplings, Sausages, Whole Corn, Onion, Chinese Cabbage", "Condiments: BBQ Sauce, Black Pepper Sauce, Garlic Butter, Tom Yam Soup", "Dessert: Sliced Fruits", "Beverages: Infused Water, Orange Juice", "Setup meja privat di area Rooftop (Kapasitas 4 Pax)"], price: "Rp 350.000 / 4 Pax" },
  floating: { title: "Floating Breakfast", subtitle: "Signature Experience", heroImg: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/GhFJvq5.jpeg", description: "Kolam privat. Nampan apung. Waktu yang sepenuhnya milik Anda. Tidak ada jadwal. Tidak ada tergesa. Hanya ketenangan yang mengapung bersama Anda.", includes: ["Pilihan menu sarapan atau kudapan ringan", "Nampan apung eksklusif", "Setup privat di kolam renang tamu", "Layanan terpersonalisasi tanpa disrupsi"], price: "Rp 350.000" },
  dinner: { title: "Romantic Dinner", subtitle: "Signature Experience", heroImg: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/HpmYccs.jpeg", description: "Meja yang disiapkan hanya untuk berdua — dengan suasana yang hangat, cahaya yang tepat, dan sajian yang diracik dengan penuh perhatian. Untuk momen yang layak diingat lama setelah malam itu berakhir.", includes: ["Appetizer: Shrimp Salad", "Soup: Chicken Cream Soup", "Main Course: Tenderloin Steak", "Dessert: Banana Split", "Beverage: Virgin Mojito & Mineral Water", "Dekorasi meja tematik elegan dan privat"], price: "Rp 500.000 / Couple" },
  towel: { title: "Romantic Towel", subtitle: "Special Occasions", heroImg: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/A7p4LM2.jpeg", description: "Sebuah detail kecil yang mengubah kamar menjadi ruang perayaan — disiapkan diam-diam sebelum Anda tiba, menunggu tanpa bersuara.", includes: ["Swan towel art arrangement", "Taburan kelopak bunga segar", "Setup rapi sebelum kedatangan", "Sentuhan personal sesuai permintaan"], price: "Rp 250.000 / Setup" },
  cake: { title: "Slice of Cake", subtitle: "Special Occasions", heroImg: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/oxMN5GC.jpeg", description: "Dari tangan Pastry Chef kami, untuk satu momen yang layak dirayakan — sekecil atau sebesar apa pun alasannya.", includes: ["Potongan kue premium dari Pastry Chef", "Plating dekoratif elegan", "Layanan pengantaran ke kamar yang tepat waktu"], price: "Rp 100.000 / Slice" }
};

const allPackages = [
  { id: 'jeep', title: "H One Jeep Adventure", img: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/MNq2vF7.jpeg", desc: "Pesisir selatan punya rute yang hanya dikenal oleh mereka yang mau melambat cukup lama untuk menemukannya." },
  { id: 'bajaj', title: "Coastal Bajaj Fun Trip", img: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/6NqMxmV.jpeg", desc: "Cara paling estetik untuk mengenal kawasan H One dari perspektif yang berbeda. Sebuah perjalanan santai." },
  { id: 'bbq', title: "Rooftop BBQ Experience", img: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/l7TWFGd.jpg", desc: "Angin laut, langit terbuka, dan bara yang menyala perlahan — private BBQ di rooftop ini dirancang untuk momen tenang." },
  { id: 'floating', title: "Floating Breakfast", img: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/GhFJvq5.jpeg", desc: "Kolam privat. Nampan apung. Waktu yang sepenuhnya milik Anda tanpa tergesa." },
  { id: 'dinner', title: "Romantic Dinner", img: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/HpmYccs.jpeg", desc: "Meja yang disiapkan hanya untuk berdua — dengan suasana yang hangat, cahaya yang tepat." },
  { id: 'towel', title: "Romantic Towel", img: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/A7p4LM2.jpeg", desc: "Sebuah detail kecil yang mengubah kamar menjadi ruang perayaan yang disiapkan secara rahasia." },
  { id: 'cake', title: "Slice of Cake", img: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/oxMN5GC.jpeg", desc: "Dari tangan Pastry Chef kami, untuk satu momen yang layak dirayakan." }
];

const meetingPackages = [
  { id: 'fullboard-platinum', title: "FULLBOARD MEETING PLATINUM", img: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/gvDEChN.jpeg", desc: "Fullboard 12 jam. 2 persons/room. Coffee break, makan lengkap, LCD, sound system, dan fasilitas eksklusif." },
  { id: 'fullboard-diamond', title: "FULLBOARD MEETING DIAMOND", img: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/qFYUnAX.jpeg", desc: "Fullboard 12 jam. 3 persons/room. Coffee break, makan lengkap, LCD, sound system, dan fasilitas eksklusif." },
  { id: 'fullboard-gold', title: "FULLBOARD MEETING GOLD", img: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/WNWRzI4.jpeg", desc: "Fullboard 12 jam. 4 persons/room. Coffee break, makan lengkap, LCD, sound system, dan fasilitas eksklusif." },
  { id: 'fullday', title: "FULL DAY MEETING", img: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/KJAt0WB.jpeg", desc: "Untuk pertemuan hingga 8 jam. Dua sesi coffee break, sajian makan siang, dan amenities yang disiapkan seamless." },
  { id: 'halfday', title: "HALF DAY MEETING", img: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/t5TdB8L.jpeg", desc: "Untuk pertemuan hingga 4 jam. Akses ruang eksklusif, coffee break, makan siang/malam, dan dukungan profesional." },
];


// ── i18n copy for the static fallback content (CMS rows are shown as the owner wrote them) ──
type RoomItem = { name: string; image: string; size: string; bed: string; tagline: string; desc: string };
type RoomRow = { nama: string; gambar_utama?: string | null; luas_m2?: number | string | null; tipe_kasur?: string | null; deskripsi_singkat?: string | null; deskripsi?: string | null };
const BED_ID = '1 King Bed / Twin Bed (Sesuai permintaan)';
const ROOM_I18N: Record<string, Record<LangKey, Partial<RoomItem>>> = {
  "Superior Sea View": {
    id: { bed: BED_ID, tagline: "Tempat cakrawala menjadi sahabat setia Anda." },
    en: { desc: "The sound of the waves is the only alarm allowed here. Morning light spreads slowly across the sea — soft and unhurried, like a day that understands you need time. This sanctuary is more than a room with a sea view. It is a private conversation between you and the southern ocean." },
  },
  "Superior Garden View": {
    id: { bed: BED_ID, tagline: "Dunia privat yang dilembutkan oleh hijau dan bayangan." },
    en: { desc: "Beneath the sheltering tropical canopy, the world feels smaller — and precisely there, more whole. Morning light filters softly through the leaves; the breeze carries the scent of damp earth as evening draws near. For those who find depth not in a wide view, but in a stillness close at hand." },
  },
  "Deluxe Sea View": {
    id: { bed: BED_ID, tagline: "Dialog tanpa jeda dengan laut selatan." },
    en: { desc: "More space does not mean more furniture — it means more sea. The southern coastline unfolds unbroken from every corner of this sanctuary, letting the sound of the waves, the quality of the light and the movement of the water become part of your daily rhythm. This is not just a view. It is immersion." },
  },
  "Deluxe Garden View": {
    id: { bed: BED_ID, tagline: "Kedalaman, bayangan, dan keheningan yang tak biasa." },
    en: { desc: "Some luxuries need no wide panorama to prove themselves. In this sanctuary, privacy feels like architecture itself — built from the surrounding green, the cooling shade, and a silence that never feels empty. A space that shelters, not merely contains." },
  },
  "Suite Sea View": {
    id: { bed: "1 Super King Bed", tagline: "Ruang paling terpikirkan yang kami tawarkan. Tak ada yang diserahkan pada kebetulan." },
    en: { desc: "Sixty-five square metres designed with an obsession for detail — where every proportion, every sightline, every material has been long considered. The Suite Sea View commands the widest coastal panorama at the resort — not as a display, but as a statement of what you deserve to experience. For those who know the difference." },
  },
};
const roomsFor = (lang: LangKey): RoomItem[] => roomsData.map(r => ({ ...r, ...(ROOM_I18N[r.name]?.[lang] ?? {}) }));

type PkgDetail = { title: string; subtitle: string; heroImg: string; description: string; includes: string[]; price: string };
type PkgCard = { id: string; title: string; img: string; desc: string };
type MeetingCard = { id: string; title: string; img: string; desc: string };
type PkgText = { subtitle?: string; description?: string; includes?: string[]; desc?: string };
const PKG_I18N: Record<string, Partial<Record<LangKey, PkgText>>> = {
  jeep: { en: {
    description: "The southern coast holds routes known only to those willing to slow down long enough to find them. An exploratory journey through the H One landscape — not to be rushed, but to truly be seen.",
    includes: ["Exclusive Jeep fleet rental", "Professional driver / guide", "Route A option: H One - Puncak Krakal - Sarangan - Slili", "Route B option: H One - Watu Kodok - Sepanjang - Nglolang", "Capacity of 4 guests per Jeep (4 Pax)"],
    desc: "The southern coast holds routes known only to those willing to slow down long enough to find them." } },
  bajaj: { en: {
    description: "The most aesthetic way to know the H One area from a different perspective. A relaxed journey designed as a way to enjoy time — not an itinerary to be completed.",
    includes: ["Exclusive Bajaj fleet", "Experienced local driver", "Route: H One - Slili - Sadranan", "Ideal capacity for a leisurely ride"],
    desc: "The most aesthetic way to know the H One area from a different perspective. A leisurely journey." } },
  bbq: {
    id: { includes: ["Hidangan Utama: French Fries / Nasi Putih, Sate, Daging Sapi Asap, Irisan Ayam, Dimsum, Sosis, Jagung Utuh, Bawang, Sawi Putih", "Pelengkap: Saus BBQ, Saus Lada Hitam, Mentega Bawang Putih, Sup Tom Yam", "Hidangan Penutup: Buah Potong", "Minuman: Infused Water, Jus Jeruk", "Setup meja privat di area Rooftop (Kapasitas 4 Pax)"] },
    en: {
      description: "Sea breeze, open sky and slowly glowing embers — this private rooftop BBQ is designed for those who understand that the best celebrations need no noise.",
      includes: ["Main Course: French Fries / Steamed Rice, Satay Skewers, Smoked Beef, Chicken Slices, Dumplings, Sausages, Whole Corn, Onion, Chinese Cabbage", "Condiments: BBQ Sauce, Black Pepper Sauce, Garlic Butter, Tom Yam Soup", "Dessert: Sliced Fruits", "Beverages: Infused Water, Orange Juice", "Private table setup on the Rooftop (Capacity 4 Pax)"],
      desc: "Sea breeze, open sky and slowly glowing embers — a private rooftop BBQ designed for a quiet moment." } },
  floating: { en: {
    description: "A private pool. A floating tray. Time that is entirely yours. No schedule. No rush. Only a calm that floats along with you.",
    includes: ["Choice of breakfast or light snack menu", "Exclusive floating tray", "Private setup in the guest pool", "Personalised service without disruption"],
    desc: "A private pool. A floating tray. Time entirely yours, unhurried." } },
  dinner: {
    id: { includes: ["Pembuka: Shrimp Salad", "Sup: Chicken Cream Soup", "Hidangan Utama: Tenderloin Steak", "Penutup: Banana Split", "Minuman: Virgin Mojito & Air Mineral", "Dekorasi meja tematik elegan dan privat"] },
    en: {
      description: "A table prepared for just two — with a warm atmosphere, just the right light, and dishes crafted with care. For a moment worth remembering long after the evening ends.",
      includes: ["Appetizer: Shrimp Salad", "Soup: Chicken Cream Soup", "Main Course: Tenderloin Steak", "Dessert: Banana Split", "Beverage: Virgin Mojito & Mineral Water", "Elegant, private themed table decoration"],
      desc: "A table prepared for just two — a warm atmosphere, just the right light." } },
  towel: {
    id: { subtitle: "Momen Istimewa", includes: ["Rangkaian handuk berbentuk angsa", "Taburan kelopak bunga segar", "Setup rapi sebelum kedatangan", "Sentuhan personal sesuai permintaan"] },
    en: {
      description: "A small detail that turns a room into a space for celebration — quietly prepared before you arrive, waiting without a word.",
      includes: ["Swan towel art arrangement", "Fresh flower petals", "Neat setup before arrival", "Personal touches on request"],
      desc: "A small detail that turns a room into a celebration space, prepared in secret." } },
  cake: {
    id: { subtitle: "Momen Istimewa" },
    en: {
      description: "From our Pastry Chef's hands, for a moment worth celebrating — however big or small the reason.",
      includes: ["Premium cake slice from our Pastry Chef", "Elegant decorative plating", "Punctual delivery to your room"],
      desc: "From our Pastry Chef's hands, for a moment worth celebrating." } },
};
const pkgListFor = (lang: LangKey): PkgCard[] => allPackages.map(p => ({ ...p, desc: PKG_I18N[p.id]?.[lang]?.desc ?? p.desc }));
const pkgDetailsFor = (lang: LangKey): Record<string, PkgDetail> => Object.fromEntries(
  Object.entries(packageDetailsData).map(([k, d]) => { const { desc: _d, ...o } = PKG_I18N[k]?.[lang] ?? {}; return [k, { ...d, ...o }]; })
);
const MEETING_DESC_EN: Record<string, string> = {
  'fullboard-platinum': "Twelve-hour fullboard. 2 persons/room. Coffee breaks, full meals, LCD, sound system and exclusive facilities.",
  'fullboard-diamond': "Twelve-hour fullboard. 3 persons/room. Coffee breaks, full meals, LCD, sound system and exclusive facilities.",
  'fullboard-gold': "Twelve-hour fullboard. 4 persons/room. Coffee breaks, full meals, LCD, sound system and exclusive facilities.",
  'fullday': "For meetings of up to 8 hours. Two coffee breaks, a lunch service and seamlessly prepared amenities.",
  'halfday': "For meetings of up to 4 hours. Exclusive room access, coffee break, lunch or dinner and professional support.",
};
const meetingsFor = (lang: LangKey): MeetingCard[] => meetingPackages.map(p => (lang === 'en' ? { ...p, desc: MEETING_DESC_EN[p.id] ?? p.desc } : p));

const categories = ["All", "Rooms", "Meeting Room", "Experiences", "Aerial Photos", "Others"];
// display names (the English keys above stay for filtering, ids and GA4)
const CAT_LABELS: Record<string, [string, string]> = {
  'All': ['Semua', 'All'], 'Rooms': ['Kamar', 'Rooms'], 'Meeting Room': ['Ruang Meeting', 'Meeting Room'],
  'Experiences': ['Pengalaman', 'Experiences'], 'Aerial Photos': ['Foto Udara', 'Aerial Photos'], 'Others': ['Lainnya', 'Others'],
};

const r2GalleryImage = (folder: string, file: string, width = 800) =>
  `https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_${width}/https://images.hone.example/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`;

const R2_GALLERY_FILES: Record<string, { folder: string; files: string[] }> = {
  "Rooms": { folder: "ROOM", files: [
    "Gemini_Generated_Image_66b71466b71466b7.png", "IMG_0399.JPG", "IMG_1258 2.JPG", "IMG_1292.JPG",
    "IMG_1534.JPG", "IMG_3360.JPG", "IMG_3368.JPG", "IMG_7089.JPG", "IMG_7295.JPG", "IMG_7315.JPG",
    "IMG_7701.JPG", "IMG_7759.JPG",
    "villa-balcony-sea-view-sunset-01.png", "villa-balcony-sea-view-sunset-02.JPG", "villa-pool-stone-nook-day-01.jpg",
    "villa-pool-terrace-night-01.png", "villa-pool-umbrella-blue-hour-01.png",
    "villa-pool-umbrella-night-02.png",
  ] },
  "Meeting Room": { folder: "MEETING ROOM", files: [
    "Gemini_Generated_Image_12out912out912ou.png", "IMG_1017.JPG", "IMG_1063.JPG", "IMG_1134.JPG", "IMG_2602.JPG",
    "IMG_2627.JPG", "IMG_5051.JPG", "IMG_5053.JPG", "IMG_5057.JPG", "IMG_5077.JPG", "IMG_5097.JPG", "IMG_9929.JPG",
    "round table photo.jpg",
  ] },
  "Experiences": { folder: "ACTIVITY EXPERIENCE", files: [
    "1764398009864_jpg.JPG", "IMG_0562.JPG", "IMG_0920.JPG", "IMG_3695_png.JPG", "IMG_5148.JPG", "IMG_5692.JPG",
    "IMG_7868.JPG", "IMG_7920.JPG", "IMG_8142.JPG", "IMG_8157.JPG", "IMG_9151.JPG", "IMG_9631.JPG",
    "Screenshot 2026-06-22 at 21.48.28.JPG",
  ] },
  "Aerial Photos": { folder: "AERIAL", files: [
    "DJI_20251116145010_0108_D.JPG", "DJI_20251217165640_0055_D.JPG", "DJI_20251217165706_0056_D.JPG",
    "DJI_20260204052607_0042_D.JPG", "IMG_111111111.JPG", "IMG_3335.JPG", "IMG_4208.JPG", "IMG_5290.JPG",
    "IMG_7456.JPG", "IMG_7705A.jpg", "IMG_7705ASAAA.jpg",
    "drone-resort-overview-fog-01.png", "drone-resort-overview-fog-02.JPG",
  ] },
  "Others": { folder: "OTHERS", files: [
    "IMG_7203.JPG.jpeg", "IMG_7974.JPG.jpeg", "IMG_7975.JPG.jpeg", "IMG_9151.JPG", "IMG_9470.JPG",
    "Untitled design - 1.JPG",
    "architecture-detail-pergola-night-01.png", "architecture-detail-stairway-night-01.png", "bench-lamppost-night-01.png",
    "corridor-doors-night-01.png", "corridor-sconces-night-01.png", "entrance-signage-night-01.png",
    "hilltop-view-dusk-01.jpg", "moonlit-walkway-night-01.png", "rooftop-lounge-deck-night-01.png",
    "rooftop-restaurant-day-01.jpg", "rooftop-restaurant-day-02.jpeg", "rooftop-restaurant-misty-morning-01.jpg",
    "rooftop-restaurant-misty-morning-02.jpg", "rooftop-terrace-moon-night-01.png", "rooftop-terrace-view-night-01.png",
    "stairway-blue-sky-day-01.JPG", "stairway-plants-night-01.png", "stairway-statue-night-01.png",
    "walkway-spiral-stairs-night-01.png", "walkway-villas-night-01.png", "walkway-villas-night-02.png",
  ] },
};

const galleryItems = Object.entries(R2_GALLERY_FILES).flatMap(([category, { folder, files }]) =>
  files.map((file, i) => ({ id: `${category}-${i}`, category, image: r2GalleryImage(folder, file) }))
);

type GalleryItem = (typeof galleryItems)[number];
// photos uploaded from admin sit on R2; the site shows them through Cloudinary (resize + CSP img-src)
const viaCdn = (url: string | null | undefined, width = 1200) =>
  url && url.startsWith('https://images.hone.example/') ? `https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_${width}/${url}` : url || '';
const pickHomeGallery = (items: GalleryItem[]) => ["Rooms-0", "Meeting Room-0", "Experiences-0", "Aerial Photos-0", "Others-0", "Rooms-5"]
  .map(id => items.find(i => i.id === id)).filter((i): i is GalleryItem => !!i);
// galeri rows (admin Galeri) -> gallery items; ids stay `${category}-${n}` so the home picks are stable
const galleryFromRows = (rows: { url: string; kategori: string }[]): GalleryItem[] => {
  const seen: Record<string, number> = {};
  return rows.filter(r => categories.includes(r.kategori)).map(r => {
    const n = seen[r.kategori] = (seen[r.kategori] ?? -1) + 1;
    return { id: `${r.kategori}-${n}`, category: r.kategori, image: `https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/${r.url}` };
  });
};

const WA_NUMBER = "6280000000000";
// 6280000000000 -> +62 813-2555-3007 (footer display)
const formatWa = (n: string) => n.startsWith('62') ? `+62 ${n.slice(2, 5)}-${n.slice(5, 9)}-${n.slice(9)}` : n;
const BOOKING_ENGINE = import.meta.env.VITE_BOOKING_ENGINE === 'on';

type PageMeta = { path: string; title: string; description: string; canonical: string; ogTitle: string; ogDescription: string; ogImage?: string; breadcrumbName?: string };
const PAGE_META: Record<string, PageMeta> = pageMetaData;

// === APP COMPONENT ===
export default function App() {
  useLenis();
  const { tr, lang, locale } = useLang();
  const navLabel = (item: string) => { const p = NAV_LABELS[item]; return p ? tr(p[0], p[1]) : item; };
  const catLabel = (cat: string) => { const p = CAT_LABELS[cat]; return p ? tr(p[0], p[1]) : cat; };
  // display name of a request option; the option value itself (tracking, H-2 rule, add-on codes) never changes
  const reqLabel = (opt: string) => (opt === NO_REQUEST ? tr('Tidak Ada', 'None') : opt === 'Other' ? tr('Lainnya', 'Other') : opt);

  // === SCROLL SECTION TRACKING (GA4) ===
  useEffect(() => {
    const sections = ['home', 'about', 'rooms', 'package', 'culinary', 'meeting-package', 'home-gallery', 'location'];
    const seen = new Set<string>();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !seen.has(entry.target.id)) {
          seen.add(entry.target.id);
          if (typeof window !== 'undefined' && (window as any).gtag) {
            (window as any).gtag('event', 'section_view', {
              event_category: 'engagement',
              section_name: entry.target.id,
            });
          }
        }
      });
    }, { threshold: 0.3 });
    sections.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  // Lazy-load behold widget only when Instagram feed section enters viewport
  useEffect(() => {
    const el = document.getElementById('instagram-feed');
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        if (!document.querySelector('script[src*="behold.so"]')) {
          const s = document.createElement('script');
          s.src = 'https://w.behold.so/widget.js';
          s.type = 'module';
          document.body.appendChild(s);
        }
        observer.disconnect();
      }
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const [isScrolled, setIsScrolled] = useState(false);
  const [navbarVisible, setNavbarVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pricelistData, setPricelistData] = useState(fallbackPricelistData);
  const [roomOpts, setRoomOpts] = useState(STATIC_ROOMS);
  const roomTypes = useMemo(() => roomOpts.map(r => r.name), [roomOpts]);
  const ROOM_FIELD_MAP = useMemo<Record<string, string>>(() => Object.fromEntries(roomOpts.map(r => [r.name, r.code])), [roomOpts]);
  const libur = useHariLibur();
  const [liveReqPrices, setLiveReqPrices] = useState<Record<string, string> | null>(null);
  const reqPrice = (opt: string) => liveReqPrices?.[opt] ?? requestPrices[opt];
  // date -> { sup_sv: 1250000, ... } from the active pricelist periods (edited in admin "Harga Dasar")
  const periodPrices = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const p of pricelistData as any[]) {
      const row: Record<string, number> = {};
      for (const f of Object.values(ROOM_FIELD_MAP)) { const v = parsePriceValue(p[f]); if (v) row[f] = v; }
      for (const d of p.checkInDates ?? []) m.set(d, row);
    }
    return m;
  }, [pricelistData]);
  // No room chosen yet -> cheapest room that night, so guests still see a "from" price.
  const nightPriceOf = (roomType: string) => (ds: string) => {
    const row = (enginePrices ?? periodPrices).get(ds);
    if (!row || !Object.keys(row).length) return null;
    const f = ROOM_FIELD_MAP[roomType];
    return f ? row[f] : Math.min(...Object.values(row));
  };
  const [floatingBarVisible, setFloatingBarVisible] = useState(false);
  const [googleRating, setGoogleRating] = useState<{ rating: number; total: number }>({ rating: 4.8, total: 101 });
  // CMS site settings (hero text dll) — fallback = copy hardcoded, override dari Supabase pengaturan kalau ada
  const [siteSettings, setSiteSettings] = useState<Record<string, string>>({
    hero_judul: 'The Luxury of Nature',
    hero_subjudul: HERO_SUB_ID,
  });
  // CMS signature experiences — null = pakai fallback hardcoded
  const [sigData, setSigData] = useState<{ list: PkgCard[]; details: Record<string, PkgDetail> } | null>(null);
  // experiences added in admin only exist in the CMS: wait for it before calling an /experiences/<id> URL "not found"
  const [sigLoaded, setSigLoaded] = useState(!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY));
  // CMS meeting packages — null = pakai fallback hardcoded
  const [meetingData, setMeetingData] = useState<{ list: MeetingCard[]; details: any[] } | null>(null);
  // CMS rooms (admin Kamar) and gallery (admin Galeri); the hardcoded copies are the fallback
  const [roomsCms, setRoomsCms] = useState<RoomRow[] | null>(null);
  // hardcoded fallback follows the website language; admin-written rooms are shown as written
  const roomsList = useMemo<RoomItem[]>(() => {
    const base = roomsFor(lang);
    if (!roomsCms) return base;
    return roomsCms.map(r => {
      const b = base.find(x => x.name === r.nama);
      return {
        name: r.nama, image: viaCdn(r.gambar_utama, 800) || b?.image || '',
        size: r.luas_m2 ? `${r.luas_m2} m²` : b?.size ?? '', bed: r.tipe_kasur || b?.bed || '',
        tagline: r.deskripsi_singkat || b?.tagline || '', desc: r.deskripsi || b?.desc || '',
      };
    });
  }, [roomsCms, lang]);
  const [galleryList, setGalleryList] = useState<GalleryItem[]>(galleryItems);
  const homeGalleryItems = useMemo(() => pickHomeGallery(galleryList), [galleryList]);

  useEffect(() => {
    fetch('/api/google-rating')
      .then(r => r.json())
      .then(d => { if (d?.rating) setGoogleRating(d); })
      .catch(() => {});
    fetch('/api/pricelist')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d) && d.length > 0) setPricelistData(d); })
      .catch(() => {});
  }, []);

  // CMS content (admin edits) — direct public-read REST. Runs at load, when the tab becomes visible again and
  // every CMS_REFRESH_MS while visible. Each setter keeps the old object when nothing changed (no flicker);
  // a failed request leaves the current state alone; an empty table falls back to the hardcoded copy.
  const cmsBusy = useRef(false);
  const loadCms = async () => {
    if (cmsBusy.current) return;
    cmsBusy.current = true;
    const sbUrl = import.meta.env.VITE_SUPABASE_URL;
    const sbKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const rest = (path: string): Promise<any[] | null> =>
      fetch(`${sbUrl}/rest/v1/${path}`, { headers: { apikey: sbKey }, cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null)).then(rows => (Array.isArray(rows) ? rows : null)).catch(() => null);
    try {
      const jobs: Promise<unknown>[] = [];
      if (BOOKING_ENGINE) {
        jobs.push(fetch('/api/booking/setting', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null))
          .then((st: { kamar?: { kode: string; nama: string }[] } | null) => {
            if (st?.kamar?.length) setIfChanged(setRoomOpts, st.kamar.map(k => ({ name: k.nama, code: k.kode })));
          }).catch(() => {}));
      }
      if (sbUrl && sbKey) {
        jobs.push(
          rest('pengaturan?select=key,value').then(rows => {
            if (!rows) return;
            const map: Record<string, string> = {};
            rows.forEach(r => { if (typeof r.value === 'string' || typeof r.value === 'number') map[r.key] = String(r.value); });
            setSiteSettings(prev => {
              const next = { ...prev, ...map };
              return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
            });
          }),
          rest('addon?select=nama,harga,satuan&aktif=eq.true').then(rows => {
            if (!rows) return;
            setIfChanged(setLiveReqPrices, rows.length === 0 ? null
              : Object.fromEntries(rows.map(r => [r.nama, `+Rp${Number(r.harga).toLocaleString('id-ID')}${r.satuan ? `/${r.satuan}` : ''}`])));
          }),
          rest('signature_experiences?select=*&is_active=eq.true&order=urutan.asc').then(rows => {
            if (!rows) return;
            if (rows.length === 0) { setSigData(null); return; }
            const list = rows.filter(r => r.image).map(r => ({ id: r.id, title: r.title, img: viaCdn(r.image, 800), desc: r.desc_singkat })); // no photo yet = no homepage card
            const details: Record<string, any> = {};
            rows.forEach(r => {
              details[r.id] = { title: r.title, subtitle: r.subtitle, heroImg: viaCdn(r.image), description: r.deskripsi, includes: r.includes ?? [], price: r.price };
            });
            setIfChanged(setSigData, { list: list as PkgCard[], details: details as Record<string, PkgDetail> });
          }).finally(() => setSigLoaded(true)),
          rest('kamar?select=nama,gambar_utama,luas_m2,tipe_kasur,deskripsi_singkat,deskripsi&is_active=eq.true&order=urutan.asc').then(rows => {
            if (!rows) return;
            setIfChanged(setRoomsCms, rows.length === 0 ? null : (rows as RoomRow[]));
          }),
          rest('galeri?select=url,kategori&is_active=eq.true&order=urutan.asc').then(rows => {
            if (!rows) return;
            const items = galleryFromRows(rows as { url: string; kategori: string }[]);
            setIfChanged(setGalleryList, items.length ? items : galleryItems);
          }),
          rest('meeting_packages?select=*&is_active=eq.true&order=urutan.asc').then(rows => {
            if (!rows) return;
            if (rows.length === 0) { setMeetingData(null); return; }
            const list = rows.filter(r => r.image).map(r => ({ id: r.id, title: r.title, img: viaCdn(r.image, 800), desc: r.desc_singkat })); // no photo yet = no homepage card
            const details = rows.map(r => ({ id: r.id, title: r.title, price: r.price, unit: r.unit, includes: r.includes ?? [] }));
            setIfChanged(setMeetingData, { list: list as MeetingCard[], details });
          }),
        );
      }
      await Promise.allSettled(jobs);
    } finally {
      cmsBusy.current = false;
    }
  };
  useEffect(() => {
    loadCms();
    const tick = () => { if (document.visibilityState === 'visible') loadCms(); };
    const iv = window.setInterval(tick, CMS_REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(iv); document.removeEventListener('visibilitychange', tick); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // pakai data CMS kalau ada, fallback ke hardcoded
  const fallbackPkgList = useMemo(() => pkgListFor(lang), [lang]);
  const fallbackPkgDetails = useMemo(() => pkgDetailsFor(lang), [lang]);
  const fallbackMeetings = useMemo(() => meetingsFor(lang), [lang]);
  const packagesList = sigData?.list ?? fallbackPkgList;
  const packageDetails: Record<string, PkgDetail> = sigData?.details ?? fallbackPkgDetails;
  const meetingList = meetingData?.list ?? fallbackMeetings;
  const heroSub = lang === 'en' && siteSettings.hero_subjudul === HERO_SUB_ID ? HERO_SUB_EN : siteSettings.hero_subjudul;
  const navigate = useNavigate();
  const location = useLocation();
  const activePage = (() => {
    const p = location.pathname;
    if (p === '/' || p === '') return 'home';
    if (p === '/pricelist') return 'pricelist';
    if (p === '/rooms') return 'rooms';
    if (p === '/meetings') return 'meetings';
    if (p === '/gallery') return 'gallery';
    if (p.startsWith('/experiences/')) {
      const id = p.split('/experiences/')[1];
      return id && packageDetails[id] ? 'package-detail' : sigLoaded ? 'notfound' : 'loading';
    }
    return 'notfound';
  })();
  const isNotFound = activePage === 'notfound';
  const meta = (() => {
    if (isNotFound) return { ...PAGE_META.home, title: 'Halaman Tidak Ditemukan | H One Resort', canonical: 'https://www.hone.example/' };
    if (activePage === 'package-detail') {
      const expId = location.pathname.split('/experiences/')[1];
      const d = (packageDetails as Record<string, { title: string; description?: string; heroImg?: string }>)[expId];
      // prerendered meta for the original experiences; items added in admin get theirs from the CMS row
      return PAGE_META[`experiences-${expId}`] ?? {
        ...PAGE_META.home, title: `${d.title} | H One Resort`, ogTitle: `${d.title} | H One Resort`,
        description: (d.description ?? '').slice(0, 155), ogDescription: (d.description ?? '').slice(0, 155),
        canonical: `https://www.hone.example/experiences/${expId}`, ogImage: d.heroImg || PAGE_META.home.ogImage, breadcrumbName: d.title,
      };
    }
    return PAGE_META[activePage] ?? PAGE_META.home;
  })();

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'page_view', {
        page_title: meta.title,
        page_location: window.location.href,
        page_path: location.pathname,
        content_group: activePage,
      });
    }
  }, [location.pathname]);

  // === SCROLL DEPTH TRACKING (GA4) — 25/50/75%, complements GA4's built-in 90% ===
  useEffect(() => {
    const thresholds = [25, 50, 75];
    const fired = new Set<number>();
    const onScroll = () => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const pct = (window.scrollY / docHeight) * 100;
      thresholds.forEach(t => {
        if (pct >= t && !fired.has(t)) {
          fired.add(t);
          if (typeof window !== 'undefined' && (window as any).gtag) {
            (window as any).gtag('event', 'scroll_depth', { event_category: 'engagement', percent_scrolled: t });
          }
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [location.pathname]);

  const selectedPackageId = location.pathname.startsWith('/experiences/')
    ? location.pathname.split('/experiences/')[1]
    : null;
  const [aboutImageIndex, setAboutImageIndex] = useState(0);

  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedGalleryItem, setSelectedGalleryItem] = useState(null);
  // gallery refreshed from the CMS: keep the open photo valid (follow it to its new id, or close if it was removed)
  useEffect(() => {
    setSelectedGalleryItem((cur: any) => {
      if (!cur) return cur;
      const same = galleryList.find(i => i.image === cur.image);
      if (!same) return null;
      return same.id === cur.id ? cur : same;
    });
  }, [galleryList]);
  const [visibleCount, setVisibleCount] = useState(24);

  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef(null);

  const [showGuestPopup, setShowGuestPopup] = useState(false);
  const [bookingDetails, setBookingDetails] = useState({ rooms: 1, adults: 2, children: 1 });
  const [showRequestPopup, setShowRequestPopup] = useState(false);
  const [showRoomTypePopup, setShowRoomTypePopup] = useState(false);
  const [selectedRoomType, setSelectedRoomType] = useState("");
  const [selectedRequests, setSelectedRequests] = useState([]);
  const [otherRequestText, setOtherRequestText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [waNumber, setWaNumber] = useState("");
  const [name, setName] = useState("");
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to?: Date }>({ from: undefined });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activePick, setActivePick] = useState<'from' | 'to'>('from');
  const [toastMessage, setToastMessage] = useState("");
  const [plModal, setPlModal] = useState({ open: false, periodLabel: '', roomType: '', roomPrice: '', checkIn: '', checkOut: '', name: '', wa: '', rooms: 1, adults: 2, children: 0, requests: [] as string[], otherRequest: '', minDate: '', maxDate: '', checkInDates: [] as string[], voucher: '' });
  const [plReqOpen, setPlReqOpen] = useState(false);
  const [addonNotice, setAddonNotice] = useState(false);
  // upsell bubble in the booking form: not enough of this room for the stay -> other room types
  const [plUpsell, setPlUpsell] = useState<{ title: string; options: Alternative[]; base?: number; need: number } | null>(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [plDateOpen, setPlDateOpen] = useState(false);
  // With the booking engine on, prices follow the admin Kalender (manual > rule-set > period) via
  // /api/booking/availability, fetched once when a date picker first opens.
  const [enginePrices, setEnginePrices] = useState<Map<string, Record<string, number>> | null>(null);
  // `${date}|${room}` -> rooms left + check-in/out closures + min nights, straight from the engine
  const [engineNights, setEngineNights] = useState<Map<string, Omit<Night, 'harga'>> | null>(null);
  const enginePricesAsked = useRef(false);
  const engineMonthsLoaded = useRef(new Set<string>());
  const engineRanges = useRef<[string, string][]>([]);
  // merges one availability range into the price / night maps (ranges may overlap)
  const loadEngine = (from: string, to: string) => {
    if (!engineRanges.current.some(([f, t]) => f === from && t === to)) engineRanges.current.push([from, to]);
    return fetch(`/api/booking/availability?from=${from}&to=${to}`)
      .then(r => (r.ok ? r.json() : null))
      .then((rows: { tanggal: string; room_code: string; harga: number | null; harga_normal: number | null; diskon_persen: number | null; sisa: number; min_malam: number | null; tutup_checkin: boolean; tutup_checkout: boolean }[] | null) => {
        if (!Array.isArray(rows)) return;
        setEnginePrices(prev => {
          const m = new Map(prev ?? []);
          for (const r of rows) {
            const day = { ...m.get(r.tanggal) };
            if (r.harga != null) day[r.room_code] = r.harga; else delete day[r.room_code]; // price removed in admin
            m.set(r.tanggal, day);
          }
          return m;
        });
        setEngineNights(prev => {
          const m = new Map(prev ?? []);
          for (const r of rows) m.set(`${r.tanggal}|${r.room_code}`, {
            sisa: r.sisa, minMalam: r.min_malam, tutupCheckin: r.tutup_checkin, tutupCheckout: r.tutup_checkout,
            hargaNormal: r.harga_normal, diskon: r.diskon_persen ? Number(r.diskon_persen) : null,
          });
          return m;
        });
      })
      .catch(() => {});
  };
  // guest comes back to the tab: reload what's on screen so sales' Kalender edits show up
  useEffect(() => {
    if (!BOOKING_ENGINE) return;
    const onShow = () => { if (document.visibilityState === 'visible') engineRanges.current.forEach(([f, t]) => loadEngine(f, t)); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!BOOKING_ENGINE || enginePricesAsked.current || !(showDatePicker || plDateOpen || plModal.open || activePage === 'pricelist')) return;
    enginePricesAsked.current = true;
    const d = new Date();
    const from = toPlDateStr(d);
    d.setDate(d.getDate() + 130);
    loadEngine(from, toPlDateStr(d));
  }, [showDatePicker, plDateOpen, plModal.open, activePage]);
  // price calendar asks for each month it shows (the first load only covers ~4 months)
  const loadEngineMonth = (firstDay: string) => {
    if (!BOOKING_ENGINE || engineMonthsLoaded.current.has(firstDay)) return;
    engineMonthsLoaded.current.add(firstDay);
    const d = new Date(firstDay + 'T00:00:00');
    loadEngine(firstDay, toPlDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 1)));
  };
  // one night of one room type, as every date picker / calendar sees it (see src/stay.ts)
  const nightOf = (code: string | undefined): NightOf => (d: string) => {
    if (!code) return undefined;
    const harga = (enginePrices ?? periodPrices).get(d)?.[code];
    return { harga, ...engineNights?.get(`${d}|${code}`) };
  };
  const [plActivePick, setPlActivePick] = useState<'from' | 'to'>('from');

  const datePickerRef = useRef<HTMLDivElement>(null);
  const guestPopupRef = useRef(null);
  const requestPopupRef = useRef(null);
  const roomTypePopupRef = useRef(null);
  const lastScrollY = useRef(0);
  const scrollTimeoutRef = useRef(null);
  const isFabHoveredRef = useRef(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // URL WhatsApp umum untuk inquiries dengan template khusus
  const waTemplateText = "*Saya sudah berkunjung ke Website H One Resort*\n\nHalo Tim Reservasi H One Resort, saya ingin melakukan reservasi dengan detail berikut:\n\nMohon untuk diisi dengan lengkap!\nNama Lengkap: \nWhatsApp Number:\nRoom Type:\nRequest:\nCheck In:\nCheck Out:\nJumlah tamu: 0 Kamar, 0 Dewasa, 0 Anak\n\nMohon info ketersediaannya. Terima kasih!\n\n_Catatan: Pastikan seluruh informasi sudah sesuai dan cantumkan pada bagian catatan apabila ada request tertentu._";
  const resortWa = (siteSettings.whatsapp || '').replace(/\D/g, '').length >= 10 ? siteSettings.whatsapp.replace(/\D/g, '') : WA_NUMBER;
  const waGeneralLink = `https://wa.me/${resortWa}?text=${encodeURIComponent(waTemplateText)}`;

  // GA4 event helper
  const trackEvent = (eventName: string, params?: Record<string, any>) => {
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', eventName, params);
    }
  };

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  useEffect(() => {
    if (!showDatePicker) return;
    const handler = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDatePicker]);


  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setMapLoaded(true); },
      { rootMargin: '200px', threshold: 0.1 }
    );
    if (mapRef.current) observer.observe(mapRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (guestPopupRef.current && !guestPopupRef.current.contains(event.target)) setShowGuestPopup(false);
      if (requestPopupRef.current && !requestPopupRef.current.contains(event.target)) setShowRequestPopup(false);
      if (roomTypePopupRef.current && !roomTypePopupRef.current.contains(event.target)) setShowRoomTypePopup(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          setIsScrolled(currentScrollY > 50);

          if (currentScrollY <= 150) {
            setNavbarVisible(true);
          } else {
            const delta = currentScrollY - lastScrollY.current;
            if (delta > 8) {
              setNavbarVisible(false);
            } else if (delta < -8) {
              setNavbarVisible(true);
            }
          }

          const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
          const isValidRange = currentScrollY > 400 && currentScrollY < maxScroll - 150;

          if (isValidRange) setFloatingBarVisible(true);
          else setFloatingBarVisible(false);

          if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
          scrollTimeoutRef.current = setTimeout(() => {
            if (!isFabHoveredRef.current) setFloatingBarVisible(false);
          }, 2500);

          lastScrollY.current = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    setVisibleCount(24);
  }, [activeCategory]);

  const scrollToBooking = (e) => {
    if (e) e.preventDefault();
    const targetAction = () => {
      const el = document.getElementById('booking-widget-section');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    if (activePage !== 'home') {
      navigate('/');
      setTimeout(targetAction, 100);
    } else {
      targetAction();
    }
    setMenuOpen(false);
  };

  const handleNavClick = (item, e) => {
    if (e) e.preventDefault();
    trackEvent('nav_click', {
      event_category: 'navigation',
      event_label: item,
      click_location: item === 'Pricelist' ? 'nav_pricelist_btn' : 'nav',
    });
    if (item === 'Rooms') {
      navigate('/rooms');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setMenuOpen(false);
      return;
    }
    if (item === 'Meetings') {
      navigate('/meetings');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setMenuOpen(false);
      return;
    }
    if (item === 'Gallery') {
      navigate('/gallery');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setMenuOpen(false);
      return;
    }
    if (item === 'Pricelist') {
      navigate('/pricelist');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setMenuOpen(false);
      return;
    }
    navigate('/');
    setTimeout(() => {
      if (item === 'Signature Experiences') {
        const el = document.getElementById('package');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 100);
    setMenuOpen(false);
  };

  const openPackageDetail = (pkgId) => {
    navigate('/experiences/' + pkgId);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const updateBooking = (field, delta) => {
    setBookingDetails(prev => {
      const newValue = prev[field] + delta;
      if (field === 'rooms' && (newValue < 1 || newValue > 5)) return prev;
      if (field === 'adults' && (newValue < 1 || newValue > 20)) return prev;
      if (field === 'children' && (newValue < 0 || newValue > 10)) return prev;
      return { ...prev, [field]: newValue };
    });
  };

  const handleWaChange = (e) => {
    const value = e.target.value;
    const numericValue = value.replace(/[^0-9+]/g, '');
    setWaNumber(numericValue);
  };

  const toggleRequest = (option) => {
    if (addonFull(option, heroCheckIn) && !selectedRequests.includes(option)) return;
    if (H2_ADDONS.includes(option) && !selectedRequests.includes(option)) setAddonNotice(true);
    setSelectedRequests(prev => toggleRequestOption(prev, option));
  };

  // l = 'id' for everything sent to staff (WhatsApp message, GA4); the form itself follows the website language
  const formatRangeDate = (date?: Date, l: LangKey = lang) => {
    if (!date) return l === 'en' ? "Select Date" : "Pilih Tanggal";
    const months = l === 'en'
      ? ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
      : ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  const handleBookNowSubmit = () => {
    if (heroH2Blocked) return;
    if (!name.trim()) return setToastMessage(tr("Masukkan nama lengkap Anda.", "Please enter your full name."));
    if (!waNumber.trim() || waNumber.length < 10) return setToastMessage(tr("Masukkan nomor WhatsApp yang valid.", "Please enter a valid WhatsApp number."));
    if (!selectedRoomType) return setToastMessage(tr("Pilih tipe kamar.", "Please select a room type."));
    if (!dateRange.from) return setToastMessage(tr("Pilih tanggal check-in.", "Please select a check-in date."));
    if (!dateRange.to) return setToastMessage(tr("Pilih tanggal check-out.", "Please select a check-out date."));

    // booking engine on: same path as the pricelist "Bayar Online" button (checkout re-checks stock + price)
    if (BOOKING_ENGINE) {
      const q = new URLSearchParams({
        kamar: ROOM_FIELD_MAP[selectedRoomType] ?? '', in: toPlDateStr(dateRange.from), out: toPlDateStr(dateRange.to),
        rooms: String(bookingDetails.rooms), adults: String(bookingDetails.adults), children: String(bookingDetails.children),
        asal: 'hero',
        addons: selectedRequests.filter(r => r !== NO_REQUEST && r !== 'Other').map(r => r.toLowerCase().replace(/\s+/g, '_')).join(','),
      });
      trackEvent('select_item', { event_category: 'booking', event_label: selectedRoomType, click_location: 'hero_booking_form' });
      navigate(`/checkout?${q}`, { state: { name, wa: waNumber } });
      return;
    }
    sendHeroWa();
  };

  // WhatsApp booking message (the only path while the booking engine is off)
  const sendHeroWa = () => {
    const targetNumber = resortWa;
    let requestStr = selectedRequests.join(", ");
    if (selectedRequests.includes("Other") && otherRequestText.trim() !== "") {
       requestStr = requestStr.replace("Other", `Other (${otherRequestText})`);
    }
    if (requestStr === "") requestStr = "-";

    const totalGuests = `${bookingDetails.rooms} Kamar, ${bookingDetails.adults} Dewasa, ${bookingDetails.children} Anak`;
    const message = `*Saya sudah berkunjung ke Website H One Resort*\n\nHalo Tim Reservasi H One Resort, saya ingin melakukan reservasi dengan detail berikut:\n\nNama Lengkap: ${name || "-"}\nWhatsApp Number: ${waNumber || "-"}\nRoom Type: ${selectedRoomType || "-"}\nRequest: ${requestStr}\nCheck In: ${formatRangeDate(dateRange.from, 'id')}\nCheck Out: ${formatRangeDate(dateRange.to, 'id')}\nJumlah tamu: ${totalGuests}\n\nMohon info ketersediaannya. Terima kasih!\n\n_Catatan: Pastikan seluruh informasi sudah sesuai dan cantumkan pada bagian catatan apabila ada request tertentu._`;

    const encodedMessage = encodeURIComponent(message);
    const waUrl = `https://wa.me/${targetNumber}?text=${encodedMessage}`;

    const heroValue = getRoomPriceValue(pricelistData[0], selectedRoomType);
    trackEvent('qualify_lead', {
      event_category: 'booking',
      event_label: selectedRoomType,
      room_type: selectedRoomType,
      click_location: 'hero_book_now',
      value: heroValue,
      currency: 'IDR',
    });
    trackEvent('generate_lead', {
      event_category: 'booking',
      event_label: selectedRoomType,
      room_type: selectedRoomType,
      check_in: formatRangeDate(dateRange.from, 'id'),
      check_out: formatRangeDate(dateRange.to, 'id'),
      click_location: 'hero_booking_form',
      value: heroValue,
      currency: 'IDR',
    });
    trackEvent('whatsapp_click', {
      event_category: 'booking',
      event_label: selectedRoomType,
      click_location: 'hero_booking_form',
      value: heroValue,
      currency: 'IDR',
    });
    setIsSubmitting(true);
    window.open(waUrl, '_blank');
    setTimeout(() => setIsSubmitting(false), 2000);
  };

  const handleGeneralInquiry = (packageName: string, location: string = 'package_card') => {
    const targetNumber = resortWa;
    const message = `*Saya sudah berkunjung ke Website H One Resort*\n\nHalo Tim Reservasi H One Resort, saya ingin menanyakan informasi lebih lanjut mengenai: *${packageName}*.\n\n_Catatan: Pastikan seluruh informasi sudah sesuai dan cantumkan pada bagian catatan apabila ada request tertentu._`;
    const encodedMessage = encodeURIComponent(message);
    const waUrl = `https://wa.me/${targetNumber}?text=${encodedMessage}`;
    trackEvent('whatsapp_click', {
      event_category: 'engagement',
      event_label: packageName,
      package_name: packageName,
      click_location: location,
    });
    window.open(waUrl, '_blank');
  };

  const handleWaGeneralClick = (location: string = 'general') => {
    trackEvent('whatsapp_click', {
      event_category: 'engagement',
      event_label: 'general_inquiry',
      click_location: location,
    });
  };

  const trackSocial = (platform: string, location: string) => {
    trackEvent('social_click', { event_category: 'social', event_label: platform, social_platform: platform, click_location: location });
  };

  const trackOutbound = (label: string, location: string) => {
    trackEvent('outbound_click', { event_category: 'outbound', event_label: label, click_location: location });
  };

  const addDays = (dateStr: string, days: number) => {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };
  // loc = 'id-ID' for the WhatsApp message staff reads; on screen it follows the website language
  const formatPlDate = (dateStr: string, loc: string = locale) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' });
  };
  const parsePlDate = (s: string): Date | undefined => s ? new Date(s + 'T00:00:00') : undefined;
  const toPlDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };
  const heroCheckIn = dateRange.from ? toPlDateStr(dateRange.from) : undefined;
  const heroH2Blocked = h2Blocked(selectedRequests, heroCheckIn);
  // daily add-on quota (Bajaj / BBQ / Romantic Dinner): units left per check-in date, only with the engine on
  const [addonSisaByDate, setAddonSisaByDate] = useState<Record<string, Record<string, number>>>({});
  const addonFull = (opt: string, date?: string) => {
    const code = QUOTA_ADDON_CODE[opt];
    return !!code && !!date && addonSisaByDate[date]?.[code] === 0;
  };
  useEffect(() => {
    if (!BOOKING_ENGINE) return;
    const dates = [...new Set([heroCheckIn, plModal.checkIn].filter((d): d is string => !!d))];
    if (!dates.length) return;
    const load = () => dates.forEach(d => {
      fetch(`/api/booking/addon-sisa?tanggal=${d}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null))
        .then(sisa => {
          if (sisa && typeof sisa === 'object') setAddonSisaByDate(prev => (JSON.stringify(prev[d]) === JSON.stringify(sisa) ? prev : { ...prev, [d]: sisa }));
        }).catch(() => {});
    });
    load();
    const onShow = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [heroCheckIn, plModal.checkIn]); // eslint-disable-line react-hooks/exhaustive-deps
  // a request that just turned out to be full for the chosen date is dropped, with a gentle note
  useEffect(() => {
    const full = selectedRequests.filter(r => addonFull(r, heroCheckIn));
    if (full.length) {
      setSelectedRequests(prev => prev.filter(r => !full.includes(r)));
      setToastMessage(tr(`${full.join(', ')} penuh untuk tanggal check-in yang dipilih.`, `${full.join(', ')} is fully booked for the selected check-in date.`));
    }
  }, [addonSisaByDate, heroCheckIn]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const full = plModal.requests.filter(r => addonFull(r, plModal.checkIn));
    if (full.length) {
      setPlModal(prev => ({ ...prev, requests: prev.requests.filter(r => !full.includes(r)) }));
      setToastMessage(tr(`${full.join(', ')} penuh untuk tanggal check-in yang dipilih.`, `${full.join(', ')} is fully booked for the selected check-in date.`));
    }
  }, [addonSisaByDate, plModal.checkIn]); // eslint-disable-line react-hooks/exhaustive-deps
  const openPlModal = (period: typeof pricelistData[0], roomType: string, roomPrice: string) => {
    trackEvent('view_item', {
      event_category: 'booking',
      event_label: roomType,
      room_type: roomType,
      period_label: period.label,
      value: parsePriceValue(roomPrice),
      currency: 'IDR',
      click_location: 'pricelist_page',
    });
    setPlModal({ open: true, periodLabel: period.label, roomType, roomPrice, checkIn: period.minCheckIn, checkOut: addDays(period.minCheckIn, 1), name: '', wa: '', rooms: 1, adults: 2, children: 0, requests: [], otherRequest: '', minDate: period.minCheckIn, maxDate: period.maxCheckIn, checkInDates: period.checkInDates, voucher: '' });
    setPlReqOpen(false);
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  };
  const closePlModal = () => {
    setPlUpsell(null);
    setPlModal(prev => ({ ...prev, open: false }));
    setPlDateOpen(false);
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  };
  const bookFromCalendar = (room: { name: string }, checkIn: string, checkOut: string, nightPrice: number) => {
    const period = pricelistData.find(pd => pd.checkInDates?.includes(checkIn))
      ?? ({ label: '', tag: '', minCheckIn: checkIn, maxCheckIn: checkIn, checkInDates: [checkIn] } as unknown as typeof pricelistData[0]);
    openPlModal(period, room.name, nightPrice.toLocaleString('id-ID'));
    setPlModal(prev => ({ ...prev, checkIn, checkOut }));
  };
  const plH2Blocked = h2Blocked(plModal.requests, plModal.checkIn);
  const togglePlRequest = (opt: string) => {
    if (addonFull(opt, plModal.checkIn) && !plModal.requests.includes(opt)) return;
    if (H2_ADDONS.includes(opt) && !plModal.requests.includes(opt)) setAddonNotice(true);
    setPlModal(prev => ({ ...prev, requests: toggleRequestOption(prev.requests, opt) }));
  };
  // engine on: the form follows real availability (same rules as the booking engine, src/stay.ts)
  const plNight = nightOf(ROOM_FIELD_MAP[plModal.roomType]);
  const plLeft = BOOKING_ENGINE && plModal.checkIn && plModal.checkOut ? roomsLeft(plModal.checkIn, plModal.checkOut, plNight) : undefined;
  const plHardMax = plModal.roomType.toLowerCase().includes('suite') ? 1 : 10;
  const plRoomOpts = roomTypes.map(name => ({ name, code: ROOM_FIELD_MAP[name] }));
  // "+" past the stock: explain and offer room types that can take the whole group for these dates
  const plAddRoom = () => {
    const need = plModal.rooms + 1;
    if (plLeft === undefined || need <= plLeft) return setPlModal(prev => ({ ...prev, rooms: Math.min(prev.rooms + 1, plHardMax) }));
    const nights = plModal.checkIn && plModal.checkOut ? plNight(plModal.checkIn)?.harga : undefined;
    setPlUpsell({
      title: plLeft === 0
        ? tr(`${plModal.roomType} sudah penuh untuk tanggal ini.`, `${plModal.roomType} is fully booked for these dates.`)
        : tr(`${plModal.roomType} hanya tersisa ${plLeft} kamar untuk tanggal ini.`, `Only ${plLeft} ${plModal.roomType} ${plLeft === 1 ? 'room is' : 'rooms are'} left for these dates.`),
      options: alternatives(plRoomOpts, nightOf, plModal.checkIn, plModal.checkOut, need, toPlDateStr(new Date()), ROOM_FIELD_MAP[plModal.roomType]),
      base: nights ?? undefined,
      need,
    });
  };
  const plTakeAlternative = (code: string) => {
    const name = plRoomOpts.find(r => r.code === code)?.name;
    if (!name || !plUpsell) return;
    trackEvent('select_promotion', { promotion_name: 'room_alternative', item_name: name, click_location: 'pricelist_modal' });
    const price = nightOf(code)(plModal.checkIn)?.harga;
    setPlModal(prev => ({ ...prev, roomType: name, rooms: plUpsell.need, roomPrice: price ? price.toLocaleString('id-ID') : prev.roomPrice }));
    setPlUpsell(null);
  };
  const plStayError = (): string | null => {
    if (!BOOKING_ENGINE || !plModal.checkIn || !plModal.checkOut) return null;
    if (!canCheckIn(plModal.checkIn, plNight, toPlDateStr(new Date()))) return tr('Tanggal check-in ini sudah tidak tersedia. Pilih tanggal lain.', 'This check-in date is no longer available. Please choose another date.');
    if (!canCheckOut(plModal.checkIn, plModal.checkOut, plNight)) return tr('Ada malam yang penuh atau belum dibuka di rentang tanggal ini. Pilih tanggal lain.', 'Some nights in this range are fully booked or not yet open. Please choose other dates.');
    if (plLeft !== undefined && plModal.rooms > plLeft) return plLeft === 1 ? tr('Hanya tersisa 1 kamar untuk tanggal ini.', 'Only 1 room left for these dates.') : tr(`Hanya tersisa ${plLeft} kamar untuk tanggal ini.`, `Only ${plLeft} rooms left for these dates.`);
    return null;
  };
  const handlePlBookNow = () => {
    if (plH2Blocked) return;
    if (!plModal.name.trim()) return setToastMessage(tr("Masukkan nama lengkap.", "Please enter your full name."));
    if (!plModal.wa.trim() || plModal.wa.replace(/\D/g, '').length < 10) return setToastMessage(tr("Masukkan nomor WhatsApp yang valid.", "Please enter a valid WhatsApp number."));
    if (!plModal.checkIn) return setToastMessage(tr("Pilih tanggal check-in.", "Please select a check-in date."));
    if (!plModal.checkOut) return setToastMessage(tr("Pilih tanggal check-out.", "Please select a check-out date."));
    const stayErr = plStayError();
    if (stayErr) return setToastMessage(stayErr);
    const formattedRequests = plModal.requests.map(r => {
      if (r === "Other") return plModal.otherRequest.trim() ? `Other (${plModal.otherRequest})` : "Other";
      return reqPrice(r) ? `${r} (${reqPrice(r)})` : r;
    });
    const requestStr = formattedRequests.length > 0 ? formattedRequests.join(", ") : "-";
    const totalGuests = `${plModal.rooms} Kamar, ${plModal.adults} Dewasa, ${plModal.children} Anak`;
    const hargaLine = (plModal.roomPrice ? `\nHarga: Rp${plModal.roomPrice}` : "") + (plModal.voucher.trim() ? `\nKode voucher: ${plModal.voucher.trim().toUpperCase()}` : "");
    const message = `*Saya sudah berkunjung ke Website H One Resort*\n\nHalo Tim Reservasi H One Resort, saya ingin melakukan reservasi dengan detail berikut:\n\nNama Lengkap: ${plModal.name}\nWhatsApp Number: ${plModal.wa}\nRoom Type: ${plModal.roomType}\nRequest: ${requestStr}\nCheck In: ${formatPlDate(plModal.checkIn, 'id-ID')}\nCheck Out: ${formatPlDate(plModal.checkOut, 'id-ID')}\nJumlah tamu: ${totalGuests}${hargaLine}\n\nMohon info ketersediaannya. Terima kasih!\n\n_Catatan: Pastikan seluruh informasi sudah sesuai dan cantumkan pada bagian catatan apabila ada request tertentu._`;
    const plValue = parsePriceValue(plModal.roomPrice);
    trackEvent('generate_lead', { event_category: 'booking', event_label: plModal.roomType, source: 'pricelist', click_location: 'pricelist_modal', value: plValue, currency: 'IDR' });
    trackEvent('whatsapp_click', { event_category: 'booking', event_label: plModal.roomType, click_location: 'pricelist_modal', value: plValue, currency: 'IDR' });
    window.open(`https://wa.me/${resortWa}?text=${encodeURIComponent(message)}`, '_blank');
    closePlModal();
  };
  const handlePlPayOnline = () => {
    if (plH2Blocked) return;
    const stayErr = plStayError();
    if (stayErr) return setToastMessage(stayErr);
    const q = new URLSearchParams({
      kamar: ROOM_FIELD_MAP[plModal.roomType] ?? '', in: plModal.checkIn, out: plModal.checkOut,
      rooms: String(plModal.rooms), adults: String(plModal.adults), children: String(plModal.children),
      voucher: plModal.voucher.trim().toUpperCase(), asal: 'pricelist',
      addons: plModal.requests.filter(r => r !== NO_REQUEST && r !== 'Other').map(r => r.toLowerCase().replace(/\s+/g, '_')).join(','),
    });
    trackEvent('select_item', { event_category: 'booking', event_label: plModal.roomType, click_location: 'pricelist_modal' });
    closePlModal();
    navigate(`/checkout?${q}`, { state: { name: plModal.name, wa: plModal.wa } });
  };

  const filteredGallery = activeCategory === "All" ? galleryList : galleryList.filter((item) => item.category === activeCategory);
  const currentGalleryIndex = filteredGallery.findIndex((i) => i.id === selectedGalleryItem?.id);
  
  const handleGalleryPrev = () => { 
    const prevIndex = (currentGalleryIndex - 1 + filteredGallery.length) % filteredGallery.length; 
    setSelectedGalleryItem(filteredGallery[prevIndex]); 
  };
  const handleGalleryNext = () => { 
    const nextIndex = (currentGalleryIndex + 1) % filteredGallery.length; 
    setSelectedGalleryItem(filteredGallery[nextIndex]); 
  };

  const isNavSolid = isScrolled || !['home', 'gallery'].includes(activePage);
  // pricelist page always has solid nav (light bg)

  return (
    <div className="min-h-screen bg-neutral-50 font-sans text-neutral-800 scroll-smooth overflow-x-hidden">
      <Helmet>
        <title>{meta.title}</title>
        <meta name="description" content={meta.description} />
        <link rel="canonical" href={meta.canonical} />
        <meta property="og:url" content={meta.canonical} />
        <meta property="og:title" content={meta.ogTitle} />
        <meta property="og:description" content={meta.ogDescription} />
        <meta name="twitter:url" content={meta.canonical} />
        <meta name="twitter:title" content={meta.ogTitle} />
        <meta name="twitter:description" content={meta.ogDescription} />
        {meta.ogImage && <meta property="og:image" content={meta.ogImage} />}
        {meta.ogImage && <meta name="twitter:image" content={meta.ogImage} />}
        {isNotFound && <meta name="robots" content="noindex, follow" />}
        {activePage !== 'home' && !isNotFound && meta.breadcrumbName && <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.hone.example/" },
            ...(activePage === 'package-detail'
              ? [
                  { "@type": "ListItem", "position": 2, "name": "Signature Experiences", "item": "https://www.hone.example/" },
                  { "@type": "ListItem", "position": 3, "name": meta.breadcrumbName, "item": meta.canonical }
                ]
              : [{ "@type": "ListItem", "position": 2, "name": meta.breadcrumbName, "item": meta.canonical }]
            )
          ]
        })}</script>}
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@id": "https://www.hone.example/#organization",
          "@type": "Organization",
          "name": "H One Resort",
          "url": "https://www.hone.example",
          "logo": "https://www.hone.example/og-image.jpg",
          "sameAs": [
            "https://www.instagram.com/honeresort/",
            "https://www.tiktok.com/@honeresort",
            "https://www.facebook.com/honeresort/"
          ]
        })}</script>
        {activePage === 'rooms' && <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": "Kamar & Suite H One Resort",
          "url": "https://www.hone.example/rooms",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "item": { "@type": "HotelRoom", "name": "Superior Sea View", "description": "Kamar 32m² dengan private pool dan pemandangan laut selatan langsung. 1 King Bed / Twin Bed.", "url": "https://www.hone.example/rooms", "image": "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_1200/https://i.imgur.com/ht7F0zP.jpeg", "floorSize": { "@type": "QuantitativeValue", "value": 32, "unitCode": "MTK" }, "amenityFeature": [{ "@type": "LocationFeatureSpecification", "name": "Private Pool", "value": true }, { "@type": "LocationFeatureSpecification", "name": "Sea View", "value": true }, { "@type": "LocationFeatureSpecification", "name": "Balcony", "value": true }], "offers": { "@type": "Offer", "priceCurrency": "IDR", "availability": "https://schema.org/InStock" } } },
            { "@type": "ListItem", "position": 2, "item": { "@type": "HotelRoom", "name": "Superior Garden View", "description": "Kamar 32m² dengan private pool dikelilingi taman tropis. 1 King Bed / Twin Bed.", "url": "https://www.hone.example/rooms", "image": "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_1200/https://i.imgur.com/oxYbkEw.jpeg", "floorSize": { "@type": "QuantitativeValue", "value": 32, "unitCode": "MTK" }, "amenityFeature": [{ "@type": "LocationFeatureSpecification", "name": "Private Pool", "value": true }, { "@type": "LocationFeatureSpecification", "name": "Garden View", "value": true }, { "@type": "LocationFeatureSpecification", "name": "Balcony", "value": true }], "offers": { "@type": "Offer", "priceCurrency": "IDR", "availability": "https://schema.org/InStock" } } },
            { "@type": "ListItem", "position": 3, "item": { "@type": "HotelRoom", "name": "Deluxe Sea View", "description": "Kamar 42m² dengan private pool dan panorama pesisir selatan tanpa hambatan. 1 King Bed / Twin Bed.", "url": "https://www.hone.example/rooms", "image": "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_1200/https://i.imgur.com/ocljqF0.jpeg", "floorSize": { "@type": "QuantitativeValue", "value": 42, "unitCode": "MTK" }, "amenityFeature": [{ "@type": "LocationFeatureSpecification", "name": "Private Pool", "value": true }, { "@type": "LocationFeatureSpecification", "name": "Sea View", "value": true }, { "@type": "LocationFeatureSpecification", "name": "Balcony", "value": true }], "offers": { "@type": "Offer", "priceCurrency": "IDR", "availability": "https://schema.org/InStock" } } },
            { "@type": "ListItem", "position": 4, "item": { "@type": "HotelRoom", "name": "Deluxe Garden View", "description": "Kamar 42m² dengan private pool dan pemandangan taman tropis. 1 King Bed / Twin Bed.", "url": "https://www.hone.example/rooms", "image": "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_1200/https://i.imgur.com/4rS8xBv.jpeg", "floorSize": { "@type": "QuantitativeValue", "value": 42, "unitCode": "MTK" }, "amenityFeature": [{ "@type": "LocationFeatureSpecification", "name": "Private Pool", "value": true }, { "@type": "LocationFeatureSpecification", "name": "Garden View", "value": true }, { "@type": "LocationFeatureSpecification", "name": "Balcony", "value": true }], "offers": { "@type": "Offer", "priceCurrency": "IDR", "availability": "https://schema.org/InStock" } } },
            { "@type": "ListItem", "position": 5, "item": { "@type": "HotelRoom", "name": "Suite Sea View", "description": "Suite 65m² dengan Super King Bed, private pool, dan panorama laut selatan terluas di H One Resort.", "url": "https://www.hone.example/rooms", "image": "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_1200/https://i.imgur.com/SKBkcRN.jpeg", "floorSize": { "@type": "QuantitativeValue", "value": 65, "unitCode": "MTK" }, "amenityFeature": [{ "@type": "LocationFeatureSpecification", "name": "Private Pool", "value": true }, { "@type": "LocationFeatureSpecification", "name": "Sea View", "value": true }, { "@type": "LocationFeatureSpecification", "name": "Balcony", "value": true }], "offers": { "@type": "Offer", "priceCurrency": "IDR", "availability": "https://schema.org/InStock" } } }
          ]
        })}</script>}
        {activePage === 'home' && <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "AggregateRating",
          "@id": "https://www.hone.example/#aggregateRating",
          "itemReviewed": { "@id": "https://www.hone.example/#hotel" },
          "ratingValue": googleRating.rating.toFixed(1),
          "reviewCount": googleRating.total,
          "bestRating": "5",
          "worstRating": "1"
        })}</script>}
      </Helmet>

      {toastMessage && (
        <div className="fixed top-6 md:top-10 left-1/2 -translate-x-1/2 z-[300] bg-[#1c1c1c]/95 backdrop-blur-md text-[#D4AF37] px-6 py-4 rounded-[8px] md:rounded-full shadow-2xl flex items-center gap-6 animate-in slide-in-from-top-4 border border-[#D4AF37]/30">
          <span className="text-[10px] md:text-[11px] font-bold uppercase tracking-widest leading-snug whitespace-nowrap">{toastMessage}</span>
          <button aria-label={tr('Tutup', 'Close')} onClick={() => setToastMessage("")} className="hover:text-white transition-colors touch-action-manipulation p-1"><X size={16}/></button>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @media (min-width: 768px) { body { overscroll-behavior-y: none; } }
        * { -webkit-font-smoothing: antialiased; }
        .font-serif { font-family: 'Cinzel', serif !important; }
        .font-quote { font-family: 'Playfair Display', serif !important; }
        .font-sans { font-family: 'Inter', sans-serif !important; }
        ::selection { background-color: #D4AF37; color: black; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #D4AF37; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .touch-action-manipulation { touch-action: manipulation; }
        .focus-ring:focus-visible { outline: 2px solid #D4AF37; outline-offset: 2px; }
        @keyframes fadeInNative { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInTopNative { from { opacity: 0; transform: translate(-50%, -1rem); } to { opacity: 1; transform: translate(-50%, 0); } }
        .animate-in.fade-in { animation: fadeInNative 0.3s ease-out forwards; }
        .animate-in.slide-in-from-top-4 { animation: slideInTopNative 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}} />
      
      <nav className={`fixed w-full z-[150] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] translate-y-0 opacity-100 ${isNavSolid ? 'bg-white/95 backdrop-blur-sm shadow-sm border-b border-neutral-100 py-3 md:py-4' : 'bg-transparent py-5 md:py-6'}`}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center">
            {/* Left: Menu (mobile) / Nav links (desktop) */}
            <div className="flex-1 flex items-center">
              {/* Mobile hamburger */}
              <button aria-label={tr('Buka/tutup menu navigasi', 'Toggle navigation menu')} onClick={() => setMenuOpen(!menuOpen)} className={`min-w-[48px] min-h-[48px] flex items-center justify-center group transition-transform duration-100 active:scale-[0.97] touch-action-manipulation focus-ring ${isNavSolid ? 'text-neutral-800' : 'text-white'}`}>
                <div className="flex flex-col items-stretch gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.2em] uppercase group-hover:text-[#D4AF37] transition-colors duration-200 text-center pl-[0.2em]">Menu</span>
                  <div className="flex flex-col gap-2 w-full mt-0.5">
                    <span className="h-[2px] w-full bg-current transition-colors duration-200 group-hover:bg-[#D4AF37]"></span>
                    <span className="h-[2px] w-full bg-current transition-colors duration-200 group-hover:bg-[#D4AF37]"></span>
                  </div>
                </div>
              </button>
            </div>
            {/* Center: Logo */}
            <a href="#home" onClick={(e) => handleNavClick('Home', e)} className="flex-shrink-0 transition-opacity hover:opacity-80 touch-action-manipulation focus-ring min-h-[48px] min-w-[48px] flex items-center justify-center">
              <img src={isNavSolid ? "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_120/https://i.imgur.com/yjAEuPv.png" : "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_120/https://i.imgur.com/MqnPJrm.png"} alt="H One Resort" width="120" height="64" className="h-10 md:h-[50px] w-auto object-contain transition-all duration-500" />
            </a>
            {/* Right: Pricelist */}
            <div className="flex-1 flex items-center justify-end gap-3">
              <LangSwitch className={`hidden md:inline-flex ${isNavSolid ? '' : LANG_ON_DARK}`} />
              <button
                onClick={() => { navigate('/pricelist'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className={`min-h-[36px] flex items-center rounded-full border px-5 py-1.5 transition-all duration-300 touch-action-manipulation focus-ring active:scale-95 ${isNavSolid ? 'bg-neutral-900 border-neutral-700 hover:bg-[#D4AF37] hover:border-[#D4AF37]' : 'bg-white/10 border-white/25 backdrop-blur-sm hover:bg-[#D4AF37]/80 hover:border-[#D4AF37]'}`}
              >
                <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-white">Pricelist</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className={`fixed inset-0 z-[200] transition-opacity duration-300 ease-in-out ${menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMenuOpen(false)}></div>
        <div className={`absolute bottom-0 w-full rounded-t-[24px] pb-[calc(2rem+env(safe-area-inset-bottom))] md:bottom-auto md:top-6 md:left-6 md:w-full md:max-w-[320px] bg-[#f2f2f2] md:rounded-[2.5rem] p-8 md:p-10 md:pb-16 shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform ${menuOpen ? 'translate-y-0 md:translate-y-0 md:translate-x-0 scale-100' : 'translate-y-full md:translate-y-[-20px] md:translate-x-[-20px] md:scale-95'}`}>
          <div className="flex justify-between items-center mb-10 md:mb-12">
            <span className="text-[10px] font-bold tracking-[0.4em] text-neutral-400 uppercase">Menu</span>
            <LangSwitch className="ml-auto mr-2 !bg-white" />
            <button aria-label={tr('Tutup menu', 'Close menu')} onClick={() => setMenuOpen(false)} className="text-neutral-800 hover:text-[#D4AF37] transition-colors duration-200 min-w-[48px] min-h-[48px] flex items-center justify-end touch-action-manipulation active:scale-95 focus-ring"><X size={24} strokeWidth={2.5} /></button>
          </div>
          <div className="flex flex-col space-y-6">
            {navItems.map((item) => {
              const isHomeDot = activePage === 'home' && item === 'Home';
              return (
                <a key={item} href={`#`} onClick={(e) => handleNavClick(item, e)} className="group flex items-center justify-between min-h-[48px] touch-action-manipulation focus-ring">
                  <span className={`text-[17px] font-medium tracking-tight transition-[padding,color] duration-200 group-hover:pl-2 ${isHomeDot ? 'text-neutral-800' : 'text-neutral-500 group-hover:text-[#D4AF37]'}`}>
                    {navLabel(item)}
                  </span>
                  {isHomeDot && <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full"></div>}
                </a>
              );
            })}
          </div>
        </div>
      </div>

      {activePage === 'home' && (
        <main id="main-content">
          <div className="relative w-full flex flex-col">
            <section id="home" className="relative h-[90svh] md:h-[100dvh] flex items-center justify-center overflow-hidden bg-neutral-900">
              <div className="absolute inset-0 w-full h-full overflow-hidden">
                {isMobile ? (
                  <img
                    src="https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_60,w_828/https://i.imgur.com/Bu0l9Oi.jpeg"
                    alt={tr('H One Resort — retret mewah pesisir di Pantai Contoh, Kabupaten Contoh', 'H One Resort — coastal luxury retreat at Pantai Contoh, Kabupaten Contoh')}
                    fetchPriority="high"
                    decoding="sync"
                    width="828"
                    height="1104"
                    className="absolute inset-0 w-full h-full object-cover object-center opacity-90"
                  />
                ) : (
                  <video autoPlay loop muted playsInline preload="auto" width="1920" height="1080" poster="https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_60,w_1440/https://i.imgur.com/Bu0l9Oi.jpeg" className="absolute inset-0 w-full h-full object-cover opacity-90 transition-opacity duration-1000">
                    <source src="https://res.cloudinary.com/YOUR_CLOUD_NAME/video/fetch/q_auto/https://i.imgur.com/aMNrnEs.mp4" type="video/mp4" />
                    <p>{tr('H One Resort — retret mewah pesisir di Pantai Contoh, Kabupaten Contoh.', 'H One Resort — coastal luxury retreat at Pantai Contoh, Kabupaten Contoh.')}</p>
                  </video>
                )}
                <div className="absolute inset-0 bg-neutral-900/40 pointer-events-none"></div>
              </div>
              <div className="relative z-10 text-center px-4 mt-[-15vh] text-white">
                <h1 className="sr-only">H One Resort — Resort Private Pool di Pantai Contoh, Kabupaten Contoh, Kota Contoh</h1>
                <WordReveal text={siteSettings.hero_judul} as="p" className="text-[clamp(1.1rem,4.5vw,3rem)] md:text-5xl font-serif font-bold mb-6 md:mb-8 leading-tight drop-shadow-2xl uppercase tracking-[0.1em] justify-center !flex-nowrap whitespace-nowrap text-[#D7AB1D]" />
                <ScrollReveal variant="fadeUp" delay={0.4}>
                  <p className="text-[12px] md:text-sm text-neutral-100 mb-6 font-light tracking-[0.3em] uppercase drop-shadow-lg opacity-90 max-w-2xl mx-auto leading-relaxed px-4">
                    {heroSub}
                  </p>
                </ScrollReveal>
                <ScrollReveal variant="fadeUp" delay={0.6}>
                  <a href="https://maps.app.goo.gl/EXAMPLE" target="_blank" rel="noreferrer" onClick={() => trackOutbound('google_maps', 'hero_rating')} className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2 mb-10 transition-colors duration-200">
                    <span className="text-[#D4AF37] text-xs tracking-wider">★★★★★</span>
                    <span className="text-white text-[11px] font-semibold">{googleRating.rating.toFixed(1)}</span>
                    <span className="text-white/40 text-[10px]">·</span>
                    <span className="text-white/70 text-[10px] font-light tracking-wider">{googleRating.total}+ {tr('Ulasan Google', 'Google Reviews')}</span>
                  </a>
                </ScrollReveal>
              </div>
            </section>

            <div id="booking-widget-section" className="relative md:absolute w-full px-4 z-[100] md:bottom-0 md:left-0 md:translate-y-1/2 -mt-12 md:mt-0 pb-12 md:pb-0">
              <div className="max-w-6xl mx-auto bg-white/95 backdrop-blur-md rounded-[16px] md:rounded-sm shadow-[0_20px_70px_-10px_rgba(0,0,0,0.12)] p-6 md:p-14 border border-white/40 relative">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-8 mb-6 md:mb-12">
                   <div className="flex flex-col relative">
                      <input type="text" aria-label={tr('Nama Lengkap', 'Full Name')} value={name} onChange={(e) => setName(e.target.value)} className="w-full p-4 md:p-3 border-b border-neutral-200 rounded-none focus:outline-none focus:border-[#D4AF37] transition-colors duration-200 bg-transparent text-base md:text-sm font-light uppercase tracking-[0.2em] md:tracking-[0.4em] placeholder:text-neutral-500 touch-action-manipulation" placeholder={tr('Nama Lengkap', 'Full Name')} />
                   </div>
                   <div className="flex flex-col relative">
                      <input type="text" inputMode="tel" aria-label={tr('Nomor WhatsApp', 'WhatsApp Number')} value={waNumber} onChange={handleWaChange} className="w-full p-4 md:p-3 border-b border-neutral-200 rounded-none focus:outline-none focus:border-[#D4AF37] transition-colors duration-200 bg-transparent text-base md:text-sm font-light uppercase tracking-[0.2em] md:tracking-[0.4em] placeholder:text-neutral-500 touch-action-manipulation" placeholder={tr('Nomor WhatsApp', 'WhatsApp Number')} />
                   </div>
                   
                   <div className="flex flex-col relative" ref={roomTypePopupRef}>
                      <div role="button" onClick={() => setShowRoomTypePopup(!showRoomTypePopup)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setShowRoomTypePopup(p => !p)} className="w-full p-4 md:p-3 border-b border-neutral-200 cursor-pointer flex justify-between items-center hover:bg-neutral-50/30 transition-colors duration-200 min-h-[48px] touch-action-manipulation focus-ring" tabIndex={0}>
                        <span className={`text-base md:text-[11px] font-light uppercase tracking-[0.2em] md:tracking-[0.4em] truncate ${selectedRoomType ? 'text-black font-normal' : 'text-neutral-500'}`}>{selectedRoomType || tr('Tipe Kamar', 'Room Type')}</span>
                        <ChevronDown size={16} className={`text-neutral-400 transition-transform duration-300 ${showRoomTypePopup ? 'rotate-180' : ''}`} />
                      </div>
                      <div className={`fixed bottom-0 left-0 w-full bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] z-[200] rounded-t-[24px] md:absolute md:top-full md:bottom-auto md:w-full md:shadow-2xl md:border md:border-neutral-100 md:p-2 md:rounded-sm md:mt-3 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform ${showRoomTypePopup ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-full md:-translate-y-4 pointer-events-none'}`}>
                         <div className="flex justify-between items-center mb-4 md:hidden">
                            <span className="text-[12px] font-bold uppercase tracking-widest">{tr('Pilih Kamar', 'Select Room')}</span>
                            <button aria-label={tr('Tutup', 'Close')} onClick={() => setShowRoomTypePopup(false)} className="p-2"><X size={20}/></button>
                         </div>
                         <div className="flex flex-col max-h-60 overflow-y-auto custom-scrollbar">
                            {roomTypes.map((type) => (
                              <div key={type} onClick={() => { setSelectedRoomType(type); setShowRoomTypePopup(false); trackEvent('room_type_select', { event_category: 'booking', event_label: type, room_type: type, click_location: 'hero_booking_form' }); }} className={`p-4 md:p-3 text-[12px] md:text-[10px] cursor-pointer hover:bg-neutral-50 transition-colors duration-200 uppercase tracking-[0.2em] font-light touch-action-manipulation ${selectedRoomType === type ? 'text-[#D4AF37] font-bold bg-neutral-50/50' : 'text-neutral-600'}`}>{type}</div>
                            ))}
                         </div>
                      </div>
                   </div>
                   
                   <div className="flex flex-col relative" ref={requestPopupRef}>
                      <div role="button" onClick={() => setShowRequestPopup(!showRequestPopup)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setShowRequestPopup(p => !p)} className="w-full p-4 md:p-3 border-b border-neutral-200 cursor-pointer flex justify-between items-center hover:bg-neutral-50/30 transition-colors duration-200 min-h-[48px] touch-action-manipulation focus-ring" tabIndex={0}>
                        <span className="text-base md:text-[11px] font-light text-neutral-500 uppercase tracking-[0.2em] md:tracking-[0.4em] truncate">{selectedRequests.length === 0 ? tr('Permintaan', 'Request') : selectedRequests.includes(NO_REQUEST) ? reqLabel(NO_REQUEST) : tr(`${selectedRequests.length} Dipilih`, `${selectedRequests.length} Selected`)}</span>
                        <ChevronDown size={16} className={`text-neutral-400 transition-transform duration-300 ${showRequestPopup ? 'rotate-180' : ''}`} />
                      </div>
                      <div className={`fixed bottom-0 left-0 w-full bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] z-[200] rounded-t-[24px] md:absolute md:top-full md:bottom-auto md:w-80 md:shadow-2xl md:border md:border-neutral-100 md:p-6 md:rounded-sm md:mt-3 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform ${showRequestPopup ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-full md:-translate-y-4 pointer-events-none'}`}>
                         <div className="flex justify-between items-center mb-4 md:hidden">
                            <span className="text-[12px] font-bold uppercase tracking-widest">{tr('Permintaan Khusus', 'Special Requests')}</span>
                            <button aria-label={tr('Tutup', 'Close')} onClick={() => setShowRequestPopup(false)} className="p-2"><X size={20}/></button>
                         </div>
                         <div className="flex flex-col space-y-1 mb-6 max-h-72 overflow-y-auto custom-scrollbar" onWheel={e => e.stopPropagation()} style={{ overscrollBehavior: 'contain' }}>
                              {requestOptions.map((opt) => (
                                <label key={opt} className={`flex items-center gap-4 p-3 md:p-2.5 rounded-sm transition-colors duration-200 group touch-action-manipulation min-h-[44px] ${addonFull(opt, heroCheckIn) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-neutral-50 cursor-pointer'}`}>
                                   <div className={`w-4 h-4 md:w-3.5 md:h-3.5 rounded-full border flex items-center justify-center transition-colors duration-200 ${selectedRequests.includes(opt) ? 'bg-[#D4AF37] border-[#D4AF37]' : 'border-neutral-200'}`}>
                                      {selectedRequests.includes(opt) && <Check size={12} className="text-white" />}
                                   </div>
                                   <input type="checkbox" className="hidden" checked={selectedRequests.includes(opt)} disabled={addonFull(opt, heroCheckIn)} onChange={() => toggleRequest(opt)} />
                                   <span className="flex-1 flex items-center justify-between gap-2">
                                     <span className={`text-[12px] md:text-[10px] font-light uppercase tracking-[0.2em] ${selectedRequests.includes(opt) ? 'text-black font-normal' : 'text-neutral-400 group-hover:text-neutral-800'}`}>{reqLabel(opt)}{addonFull(opt, heroCheckIn) && <span className="ml-2 normal-case tracking-normal text-[10px] text-red-500">{tr('(penuh)', '(full)')}</span>}</span>
                                     {reqPrice(opt) && <span className="text-[10px] md:text-[9px] text-neutral-400 font-light shrink-0">{reqPrice(opt)}</span>}
                                   </span>
                                </label>
                              ))}
                         </div>
                         {selectedRequests.includes("Other") && (
                           <textarea value={otherRequestText} onChange={(e) => setOtherRequestText(e.target.value)} placeholder={tr('Permintaan khusus...', 'Special requests...')} className="w-full p-4 md:p-3 border border-neutral-100 rounded-sm text-[16px] md:text-[10px] focus:outline-none focus:border-[#D4AF37] h-20 resize-none animate-in fade-in bg-neutral-50/50 mb-4 touch-action-manipulation" />
                         )}
                         <button onClick={() => setShowRequestPopup(false)} className="w-full min-h-[48px] py-4 md:py-3 bg-black text-[#D4AF37] text-[12px] md:text-[10px] font-bold uppercase tracking-[0.4em] active:scale-95 transition-transform duration-100 touch-action-manipulation rounded-[8px] md:rounded-none">{tr('Konfirmasi', 'Confirm')}</button>
                      </div>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-10 items-end">
                  {/* Date Range Picker — spans 2 cols on desktop */}
                  <div className="col-span-1 md:col-span-2 relative" ref={datePickerRef}>
                    <div className="grid grid-cols-2 gap-6 md:gap-10">
                      {/* Check-in trigger */}
                      <div
                        className="flex flex-col cursor-pointer min-h-[48px]"
                        onClick={() => { setActivePick('from'); setDateRange({ from: undefined }); setShowDatePicker(true); }}
                      >
                        <div className={`flex items-center pb-4 border-b transition-colors duration-200 w-full ${showDatePicker && activePick === 'from' ? 'border-[#D4AF37]' : 'border-neutral-100 hover:border-[#D4AF37]'}`}>
                          <Calendar className={`mr-3 shrink-0 transition-colors duration-200 ${showDatePicker && activePick === 'from' ? 'text-[#D4AF37]' : 'text-[#D4AF37]/60'}`} size={18} />
                          <div className="flex flex-col w-full min-w-0">
                            <span className="text-[10px] md:text-[8px] font-light text-neutral-400 uppercase tracking-[0.5em] mb-1">Check-in</span>
                            <span className={`text-[12px] md:text-[11px] font-light tracking-widest uppercase truncate ${dateRange.from ? 'text-neutral-800' : 'text-neutral-400'}`}>{formatRangeDate(dateRange.from)}</span>
                          </div>
                        </div>
                      </div>
                      {/* Check-out trigger */}
                      <div
                        className="flex flex-col cursor-pointer min-h-[48px]"
                        onClick={() => { setActivePick('to'); setShowDatePicker(true); }}
                      >
                        <div className={`flex items-center pb-4 border-b transition-colors duration-200 w-full ${showDatePicker && activePick === 'to' ? 'border-[#D4AF37]' : 'border-neutral-100 hover:border-[#D4AF37]'}`}>
                          <Calendar className={`mr-3 shrink-0 transition-colors duration-200 ${showDatePicker && activePick === 'to' ? 'text-[#D4AF37]' : 'text-[#D4AF37]/60'}`} size={18} />
                          <div className="flex flex-col w-full min-w-0">
                            <span className="text-[10px] md:text-[8px] font-light text-neutral-400 uppercase tracking-[0.5em] mb-1">Check-out</span>
                            <span className={`text-[12px] md:text-[11px] font-light tracking-widest uppercase truncate ${dateRange.to ? 'text-neutral-800' : 'text-neutral-400'}`}>{formatRangeDate(dateRange.to)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Calendar popover — bottom sheet on mobile, dropdown on desktop */}
                    <div className={`fixed bottom-0 left-0 w-full bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] z-[300] rounded-t-[24px] md:absolute md:top-full md:bottom-auto md:left-0 md:w-auto md:min-w-[580px] md:shadow-2xl md:border md:border-neutral-100 md:rounded-sm md:mt-4 md:p-6 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform overflow-auto md:overflow-visible max-h-[90vh] md:max-h-none ${showDatePicker ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-full md:translate-y-2 pointer-events-none'}`}>
                      {/* Header — hint text */}
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-[10px] font-light uppercase tracking-[0.25em] text-[#8A6D00]">
                          {!dateRange.from ? tr('Pilih tanggal check-in', 'Select check-in date') : !dateRange.to ? tr('Sekarang pilih check-out →', 'Now select check-out →') : tr('Tanggal terpilih ✓', 'Dates selected ✓')}
                        </span>
                        <button aria-label={tr('Tutup', 'Close')} onClick={() => setShowDatePicker(false)} className="p-1 text-neutral-400 hover:text-neutral-800 transition-colors"><X size={16}/></button>
                      </div>
                      <Suspense fallback={<div className="h-64 flex items-center justify-center text-neutral-400 text-xs">{tr('Memuat kalender...', 'Loading calendar...')}</div>}>
                        <DayDataContext.Provider value={{ libur, priceOf: nightPriceOf(selectedRoomType) }}>
                        <DayPicker
                          components={DAY_COMPONENTS}
                          mode="range"
                          locale={dpLocale(lang)}
                          selected={dateRange}
                          onSelect={(range: any) => {
                            const sameDay = range?.from && range?.to &&
                              range.from.toDateString() === range.to.toDateString();
                            if (sameDay) {
                              setDateRange({ from: range!.from, to: undefined });
                              setActivePick('to');
                            } else if (range?.from && !range?.to) {
                              setDateRange(range);
                              setActivePick('to');
                            } else if (range?.from && range?.to) {
                              setDateRange(range);
                              setActivePick('from');
                              setShowDatePicker(false);
                            } else {
                              setDateRange(range || { from: undefined });
                            }
                          }}
                          numberOfMonths={2}
                          disabled={{ before: today }}
                          className="rdp-hone rdp-priced"
                        />
                        </DayDataContext.Provider>
                      </Suspense>
                      <button onClick={() => setShowDatePicker(false)} className="md:hidden w-full min-h-[48px] py-4 mt-2 bg-black text-[#D4AF37] text-[12px] font-bold uppercase tracking-[0.4em] rounded-[8px]">{tr('Konfirmasi Tanggal', 'Confirm Dates')}</button>
                    </div>
                  </div>
                  
                  <div className="flex flex-col relative" ref={guestPopupRef}>
                    <div role="button" onClick={() => setShowGuestPopup(!showGuestPopup)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setShowGuestPopup(p => !p)} className="flex items-center justify-between pb-4 border-b border-neutral-100 group-hover:border-[#D4AF37] transition-colors duration-200 cursor-pointer min-h-[48px] touch-action-manipulation focus-ring" tabIndex={0}>
                      <div className="flex items-center">
                        <Users className="text-[#D4AF37]/60 mr-4 shrink-0" size={20} />
                        <div className="flex flex-col">
                          <span className="text-[10px] md:text-[8px] font-light text-neutral-400 uppercase tracking-[0.5em] mb-1">{tr('Tamu', 'Guests')}</span>
                          <span className="text-[13px] md:text-[11px] font-light text-neutral-800 uppercase tracking-widest">{bookingDetails.rooms} {tr('KMR', 'RMS')}, {bookingDetails.adults} {tr('DWS', 'ADT')}</span>
                        </div>
                      </div>
                      <ChevronDown size={16} className={`text-neutral-300 transition-transform duration-300 ${showGuestPopup ? 'rotate-180 text-[#D4AF37]' : ''}`} />
                    </div>
                    <div className={`fixed bottom-0 left-0 w-full bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] z-[200] rounded-t-[24px] md:absolute md:top-full md:bottom-auto md:w-80 md:shadow-2xl md:border md:border-neutral-50 md:p-7 md:rounded-sm md:mt-4 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform ${showGuestPopup ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-full md:-translate-y-4 pointer-events-none'}`}>
                         <div className="flex justify-between items-center mb-6 md:hidden">
                            <span className="text-[12px] font-bold uppercase tracking-widest">{tr('Pilih Tamu', 'Select Guests')}</span>
                            <button aria-label={tr('Tutup', 'Close')} onClick={() => setShowGuestPopup(false)} className="p-2"><X size={20}/></button>
                         </div>
                         {[ { id: 'rooms', label: tr('Kamar', 'Rooms') }, { id: 'adults', label: tr('Dewasa', 'Adults') }, { id: 'children', label: tr('Anak', 'Children') } ].map((item) => (
                          <div key={item.id} className="flex items-center justify-between py-5 md:py-4 border-b border-neutral-50 last:border-0 min-h-[48px]">
                            <span className="text-[11px] md:text-[9px] font-light uppercase tracking-[0.4em] text-neutral-500">{item.label}</span>
                            <div className="flex items-center space-x-6 md:space-x-5">
                              <button aria-label={tr(`Kurangi ${item.label}`, `Decrease ${item.label}`)} onClick={() => updateBooking(item.id, -1)} className="w-10 h-10 md:w-7 md:h-7 rounded-full border border-neutral-200 flex items-center justify-center hover:bg-neutral-50 text-neutral-500 touch-action-manipulation active:scale-95 transition-transform duration-100"><Minus size={14}/></button>
                              <span className="text-[14px] md:text-[11px] font-normal w-4 text-center">{bookingDetails[item.id]}</span>
                              <button aria-label={tr(`Tambah ${item.label}`, `Increase ${item.label}`)} onClick={() => updateBooking(item.id, 1)} className="w-10 h-10 md:w-7 md:h-7 rounded-full border border-neutral-200 flex items-center justify-center hover:bg-neutral-50 text-neutral-500 touch-action-manipulation active:scale-95 transition-transform duration-100"><Plus size={14}/></button>
                            </div>
                          </div>
                         ))}
                         <button onClick={() => setShowGuestPopup(false)} className="w-full mt-6 md:mt-6 min-h-[56px] md:min-h-[48px] bg-black text-[#D4AF37] text-[12px] md:text-[10px] font-bold uppercase tracking-[0.4em] active:scale-95 transition-transform duration-100 touch-action-manipulation rounded-[8px] md:rounded-none">{tr('Terapkan', 'Apply')}</button>
                      </div>
                  </div>
                  
                  <button onClick={handleBookNowSubmit} disabled={isSubmitting || heroH2Blocked} className="bg-black text-[#D4AF37] min-h-[56px] md:min-h-auto md:py-6 px-4 rounded-[8px] md:rounded-[1px] font-bold uppercase tracking-[0.3em] md:tracking-[0.5em] text-[12px] md:text-[10px] shadow-lg transition-transform duration-100 active:scale-[0.97] self-stretch touch-action-manipulation w-full focus-ring disabled:opacity-60 disabled:cursor-not-allowed">
                    {isSubmitting ? tr('Membuka WA...', 'Opening WA...') : tr('Pesan Sekarang', 'Book Now')}
                  </button>
                </div>
                {heroH2Blocked && <p role="alert" className="mt-4 text-center text-[12px] md:text-[11px] text-red-600">{h2Message(tr)}</p>}
                {addonNotice && <AddonH2Modal onClose={() => setAddonNotice(false)} />}
                {BOOKING_ENGINE && (
                  <p className="mt-5 text-center text-[12px] md:text-[11px] text-neutral-500">
                    {tr('Lebih suka chat dulu?', 'Prefer to chat first?')}{' '}
                    <button type="button" disabled={heroH2Blocked} onClick={() => {
                      if (heroH2Blocked) return;
                      if (!name.trim() || !selectedRoomType || !dateRange.from || !dateRange.to) return setToastMessage(tr("Lengkapi nama, kamar, dan tanggal dulu.", "Please complete your name, room and dates first."));
                      sendHeroWa();
                    }} className="underline underline-offset-2 hover:text-[#8A6D00] disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed">{tr('Pesan via WhatsApp', 'Book via WhatsApp')}</button>
                  </p>
                )}
              </div>
            </div>
          </div>

          <section id="about" className="pt-24 md:pt-80 pb-20 md:pb-32 px-4 bg-neutral-50 relative z-10">
            <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-24 items-center">
              <div>
                <ScrollReveal variant="slideLeft" duration={1}>
                  <p className="text-[#8A6D00] font-bold tracking-[0.4em] text-[10px] mb-4 md:mb-6 uppercase italic">Pantai Contoh · Kabupaten Contoh · Kota Contoh</p>
                </ScrollReveal>
                <WordReveal text={tr('Sanctuary Pesisir Privat', 'Private Coastal Sanctuary')} as="h2" delay={0.2} stagger={0.07} className="text-xl md:text-2xl font-serif text-black mb-8 md:mb-10 uppercase tracking-wide leading-snug" />
                <ScrollReveal variant="blur" delay={0.4} duration={1} className="text-neutral-500 font-light leading-loose space-y-6 text-justify text-sm md:text-base">
                  <p>{tr('H One Resort adalah private coastal luxury retreat yang berdiri tepat di tepi pesisir selatan Kota Contoh — terintegrasi dalam kawasan Pantai Contoh, dengan arsitektur contemporary Mediterranean yang membiarkan alam berbicara lebih keras dari dindingnya.',
                    'H One Resort is a private coastal luxury retreat standing right on the southern shore of Kota Contoh — set within the H One Beach area, with contemporary Mediterranean architecture that lets nature speak louder than its walls.')}</p>
                  <p>{tr('Ini bukan sekadar tempat menginap. Ini adalah undangan untuk kembali — ke ritme yang lebih lambat, ke momen yang lebih bermakna. Seluruh aspek resort dijalankan dengan satu prinsip yang tidak pernah berubah:',
                    'This is not merely a place to stay. It is an invitation to return — to a slower rhythm, to more meaningful moments. Every aspect of the resort is run on one principle that never changes:')} <strong><em>"Presence Without Intrusion" — Attentive, discreet, and always intentional.</em></strong></p>
                </ScrollReveal>
              </div>
              <ScrollReveal variant="zoomIn" className="relative group overflow-hidden rounded-sm shadow-2xl">
                <img loading="lazy" decoding="async" src={aboutImages[aboutImageIndex]} width="800" height="600" className="w-full aspect-[4/3] object-cover transition-transform duration-[1500ms] ease-out group-hover:scale-110" alt={tr('H One Resort — pemandangan kawasan resort di tepi Pantai Contoh, Kabupaten Contoh', 'H One Resort — view of the resort grounds on the shore of Pantai Contoh, Kabupaten Contoh')} />
                <div className="absolute inset-0 flex items-center justify-between px-4 md:px-6 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <button aria-label={tr('Gambar sebelumnya', 'Previous image')} onClick={() => setAboutImageIndex((p) => (p - 1 + aboutImages.length) % aboutImages.length)} className="bg-black/30 md:bg-white/20 backdrop-blur-sm p-3 rounded-full text-white min-w-[48px] min-h-[48px] flex items-center justify-center touch-action-manipulation active:scale-95 transition-transform duration-100"><ChevronLeft/></button>
                  <button aria-label={tr('Gambar berikutnya', 'Next image')} onClick={() => setAboutImageIndex((p) => (p + 1) % aboutImages.length)} className="bg-black/30 md:bg-white/20 backdrop-blur-sm p-3 rounded-full text-white min-w-[48px] min-h-[48px] flex items-center justify-center touch-action-manipulation active:scale-95 transition-transform duration-100"><ChevronRight/></button>
                </div>
              </ScrollReveal>
            </div>
          </section>

          <section id="rooms" className="bg-black py-20 md:py-32 overflow-hidden select-none">
            <div className="max-w-full px-4 lg:px-12">
              <ScrollReveal variant="fadeUp" className="text-center mb-16 md:mb-24">
                <p className="text-[#D4AF37] font-bold tracking-[0.4em] text-[10px] mb-4 uppercase italic">Private Pool Villa · Pantai Contoh, Kabupaten Contoh</p>
                <WordReveal text={tr('Sanctuary Privat Kami', 'Our Private Sanctuaries')} as="h2" delay={0.2} stagger={0.05} className="text-2xl md:text-4xl font-serif text-[#D7AB1D] tracking-wide justify-center" />
                <div className="h-[1px] w-16 md:w-24 bg-[#D4AF37]/50 mx-auto mt-6 md:mt-8"></div>
              </ScrollReveal>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 bg-black md:border-y border-white/20 divide-y sm:divide-y-0 sm:divide-x divide-white/20 shadow-2xl w-full">
                {roomsList.map((room, i) => (
                  <ScrollReveal variant="fadeUp" delay={i * 0.1} key={i} className="group relative overflow-hidden bg-neutral-900 aspect-[4/5] sm:aspect-[2/3] lg:aspect-auto lg:h-[550px] xl:h-[600px] cursor-pointer touch-action-manipulation" as="div">
                    <div role="button" tabIndex={0} aria-label={tr(`Lihat ${room.name}`, `View ${room.name}`)} onClick={() => { trackEvent('room_click', { event_category: 'engagement', event_label: room.name, room_name: room.name, click_location: 'rooms_section' }); navigate('/rooms'); setTimeout(() => { const targetId = `room-${room.name.toLowerCase().replace(/[\s/]+/g, '-')}`; document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth' }); }, 100); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { trackEvent('room_click', { event_category: 'engagement', event_label: room.name, room_name: room.name, click_location: 'rooms_section' }); navigate('/rooms'); setTimeout(() => { const targetId = `room-${room.name.toLowerCase().replace(/[\s/]+/g, '-')}`; document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth' }); }, 100); } }} className="w-full h-full block">
                      <img draggable="false" loading="lazy" decoding="async" src={room.image} width="600" height="900" className="w-full h-full object-cover transition-transform duration-[1000ms] group-hover:scale-105 select-none" alt={room.name} />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-90 pointer-events-none"></div>
                      <div className="absolute inset-0 p-6 md:p-8 flex flex-col justify-end pointer-events-none">
                        <h3 className="text-white font-serif text-lg lg:text-xl uppercase tracking-widest mb-4 md:transition-transform md:duration-300 md:group-hover:-translate-y-4 whitespace-nowrap leading-snug drop-shadow-md">{room.name}</h3>
                        <div className="h-[1px] w-12 bg-[#D4AF37] origin-left md:scale-x-0 md:group-hover:scale-x-100 transition-transform duration-300"></div>
                      </div>
                    </div>
                  </ScrollReveal>
                ))}
              </div>
            </div>
          </section>

          <section id="package" className="pt-24 pb-12 bg-white overflow-hidden">
            <ScrollReveal variant="fadeUp" className="text-center mb-10 md:mb-16 max-w-7xl mx-auto px-4">
              <p className="text-[#8A6D00] font-bold tracking-[0.4em] text-[10px] mb-4 uppercase italic">{tr('Kurasi Untuk Anda', 'Curated For You')}</p>
              <WordReveal text="Signature Experiences" as="h2" className="text-2xl md:text-4xl font-serif text-black uppercase tracking-wide justify-center" />
              <p className="text-neutral-500 mt-6 max-w-2xl mx-auto font-light leading-relaxed text-sm md:text-base">
                {tr('Bukan daftar aktivitas. Ini adalah pilihan — sepenuhnya milik Anda, dijalani dalam ritme yang Anda tentukan sendiri.',
                  'Not a list of activities. A choice — entirely yours, lived at a rhythm you set yourself.')} <em>Intentional in design. Effortless in execution.</em>
              </p>
            </ScrollReveal>
            <ScrollReveal variant="fadeIn" delay={0.2} duration={1.5} className="w-full">
              <Suspense fallback={<div className="w-full h-[460px] bg-neutral-100 animate-pulse rounded-lg" />}>
                <SplideExperiencesCarousel items={packagesList} onOpenDetail={openPackageDetail} />
              </Suspense>
            </ScrollReveal>
          </section>

          <section id="culinary" className="py-20 md:py-32 bg-white px-4 border-t border-neutral-50">
            <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center">
              <ScrollReveal variant="zoomIn" className="">
                <FoodSlideshow images={[
                  { src: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/7iehu2w.jpeg", alt: tr('Kuliner 1', 'Culinary 1') },
                  { src: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/6iu5kF8.jpeg", alt: tr('Kuliner 2', 'Culinary 2') },
                  { src: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/FQwLtCx.jpeg", alt: tr('Kuliner 3', 'Culinary 3') },
                  { src: "https://res.cloudinary.com/YOUR_CLOUD_NAME/image/fetch/f_auto,q_auto,w_800/https://i.imgur.com/BZJsHwJ.jpeg", alt: tr('Kuliner 4', 'Culinary 4') },
                ]} />
              </ScrollReveal>
              <div>
                <ScrollReveal variant="slideRight" delay={0.2}>
                  <p className="text-[#8A6D00] font-bold tracking-[0.4em] text-[10px] mb-4 md:mb-8 uppercase italic">{tr('Kuliner', 'Gastronomy')}</p>
                  <WordReveal text={tr('Sarapan & Bersantap', 'Breakfast & Dining')} as="h2" delay={0.3} stagger={0.08} className="text-2xl md:text-5xl font-serif text-black mb-8 md:mb-10 uppercase tracking-wide leading-tight" />
                  <div className="text-neutral-500 font-light leading-loose space-y-6 text-justify text-sm md:text-base">
                    <p>{tr('Hari dimulai dengan aroma kopi dan udara laut pagi yang masuk perlahan — sarapan yang tidak terburu-buru, dalam suasana terbuka yang membiarkan Anda benar-benar hadir di momen itu.',
                      'The day begins with the aroma of coffee and the morning sea air drifting in — an unhurried breakfast in an open setting that lets you be fully present in the moment.')}</p>
                    <p>{tr('Di H One Resort, makan bukan sekadar kebutuhan. Ia adalah bagian dari experience itu sendiri.',
                      'At H One Resort, dining is more than a necessity. It is part of the experience itself.')}</p>
                  </div>
                </ScrollReveal>
              </div>
            </div>
          </section>

          <section id="meeting-package" className="py-20 md:py-32 bg-neutral-50 relative select-none">
            <div className="max-w-full">
              <ScrollReveal variant="fadeUp" className="text-center mb-16 md:mb-24 max-w-4xl mx-auto px-4">
                <div>
                  <p className="text-[#8A6D00] font-bold tracking-[0.4em] text-[10px] mb-4 uppercase italic">{tr('Pertemuan Eksekutif', 'Executive Gatherings')}</p>
                  <WordReveal text={tr('Meeting dengan Panorama Langit & Laut', 'Sky & Sea View Meetings')} as="h2" delay={0.2} stagger={0.05} className="text-2xl md:text-5xl font-serif text-[#8A6D00] mb-6 md:mb-8 uppercase tracking-wide justify-center" />
                  <div>
                    <p className="font-quote text-lg md:text-2xl italic text-black tracking-wide mb-6">"Focused. Seamless. Thoughtfully hosted."</p>
                    <p className="text-neutral-600 font-light text-sm md:text-lg leading-relaxed max-w-3xl mx-auto">
                      {tr('Bukan sekadar ruang rapat dengan view bagus. Ini adalah environment yang secara sengaja dirancang untuk mendukung fokus, privasi, dan dialog yang terarah.',
                        'Not merely a meeting room with a good view. An environment deliberately designed to support focus, privacy and purposeful dialogue.')}
                    </p>
                  </div>
                </div>
              </ScrollReveal>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-0">
                {meetingList.map((pkg, i) => (
                  <ScrollReveal variant="fadeUp" delay={i * 0.15} key={i} className="group relative overflow-hidden bg-white border-b md:border-b-0 md:border-r border-neutral-100 last:border-0 cursor-pointer touch-action-manipulation">
                    <div role="button" tabIndex={0} aria-label={tr(`Lihat paket ${pkg.title}`, `View ${pkg.title} package`)} onClick={() => { trackEvent('package_click', { event_category: 'engagement', event_label: pkg.title, package_name: pkg.title, click_location: 'meetings_section' }); navigate('/meetings'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { trackEvent('package_click', { event_category: 'engagement', event_label: pkg.title, package_name: pkg.title, click_location: 'meetings_section' }); navigate('/meetings'); window.scrollTo({ top: 0, behavior: 'smooth' }); } }} className="block w-full h-full">
                      <div className="aspect-[4/3] md:aspect-[4/5] lg:aspect-[2/3] overflow-hidden">
                        <img draggable="false" loading="lazy" decoding="async" src={pkg.img} width="600" height="800" className="w-full h-full object-cover transition-transform duration-[1000ms] md:group-hover:scale-105 select-none" alt={pkg.title} />
                      </div>
                      <div className="p-8 md:p-12 text-center md:group-hover:bg-neutral-50 transition-colors duration-300 pointer-events-none">
                        <h3 className="text-sm font-serif text-black uppercase tracking-[0.2em] mb-4">{pkg.title}</h3>
                        <span className="text-[9px] font-bold uppercase tracking-[0.4em] text-[#8A6D00] border-b border-[#8A6D00]/30 pb-1">{tr('Tanyakan Ketersediaan', 'Inquire Availability')}</span>
                      </div>
                    </div>
                  </ScrollReveal>
                ))}
              </div>
            </div>
          </section>

          <section id="home-gallery" className="py-20 md:py-32 bg-black overflow-hidden relative select-none">
            <ScrollReveal variant="fadeUp" className="text-center mb-10 md:mb-16 max-w-7xl mx-auto px-4">
              <p className="text-[#D4AF37] font-bold tracking-[0.4em] text-[10px] mb-4 uppercase italic">{tr('Perjalanan Visual', 'Visual Journey')}</p>
              <WordReveal text={tr('Galeri', 'Gallery')} as="h2" className="text-2xl md:text-4xl font-serif text-white uppercase tracking-wide justify-center" />
              <div className="h-[1px] w-16 md:w-24 bg-[#D4AF37]/50 mx-auto mt-6 md:mt-8"></div>
            </ScrollReveal>
            <ScrollReveal variant="fadeIn" delay={0.2} duration={1.5} className="w-full">
              <Suspense fallback={<div className="w-full h-[460px] bg-neutral-800 animate-pulse rounded-lg" />}>
                <SplideGalleryCarousel items={homeGalleryItems} onOpenItem={(item) => setSelectedGalleryItem(item)} />
              </Suspense>
            </ScrollReveal>
            <ScrollReveal variant="fadeUp" delay={0.4} className="flex justify-center mt-4 md:mt-8 relative z-20">
              <button onClick={() => { trackEvent('gallery_discover_more', { event_category: 'engagement', event_label: 'discover_more', click_location: 'home_gallery_section' }); navigate('/gallery'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="border border-white/50 text-white hover:bg-white hover:text-black transition-colors duration-300 px-8 py-3 md:px-12 md:py-4 text-[10px] font-bold uppercase tracking-[0.3em] focus-ring touch-action-manipulation">
                {tr('Lihat Selengkapnya', 'Discover More')}
              </button>
            </ScrollReveal>
          </section>

          <section id="location" className="py-20 md:py-24 bg-white px-4 border-t border-neutral-100">
            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 md:gap-16">
              <ScrollReveal variant="slideRight">
                <p className="text-[#8A6D00] font-bold tracking-[0.4em] text-[10px] mb-4 md:mb-6 uppercase italic">{tr('Pengalaman Resort Terpadu', 'Integrated Resort Experience')}</p>
                <WordReveal text={tr('Area Akomodasi', 'Accommodation Area')} as="h2" delay={0.2} stagger={0.06} className="text-2xl lg:text-3xl font-serif text-black mb-8 uppercase tracking-wide" />
                <div className="flex items-start gap-4 mb-10 text-neutral-600 bg-neutral-50 p-6 rounded-sm border border-neutral-100">
                  <MapPin className="text-[#D4AF37] shrink-0 mt-1" size={20} />
                  <p className="text-sm leading-relaxed">
                    {tr('Terletak strategis di kawasan Pantai Contoh, resor ini menawarkan akses mudah ke berbagai destinasi eksotis dengan tetap menjaga privasi mutlak Anda:',
                      'Ideally located in the H One Beach area, the resort offers easy access to a range of exotic destinations while preserving your complete privacy:')}<br/><br/>
                    {siteSettings.alamat || 'Jl. Contoh No. 1, Kota Contoh, Provinsi Contoh 00000'}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-6">
                  <div className="space-y-4">
                     {[ { name: "Pool KSP Sinar Jaya", dist: "0 km" }, { name: "Pool Jeep Wisata Pantai Contoh", dist: "0 km" }, { name: "H One", dist: "0 km" }, { name: "Pantai Contoh", dist: "0,1 km" }, { name: "On The Rock", dist: "0,2 km" } ].map((loc, i) => (
                        <div key={i} className="flex justify-between items-center border-b border-neutral-100 pb-3 min-h-[32px]">
                           <span className="text-[13px] font-medium text-neutral-700">{loc.name}</span>
                           <span className="text-[11px] font-bold tracking-widest text-[#8A6D00]">{lang === 'en' ? loc.dist.replace(',', '.') : loc.dist}</span>
                        </div>
                     ))}
                  </div>
                  <div className="space-y-4">
                     {[ { name: "Pom Mini", dist: "0,3 km" }, { name: "Pantai Watu Kodok", dist: "1 km" }, { name: "Pantai Sepanjang", dist: "1 km" }, { name: "SPKLU H One Hills", dist: "2 km" }, { name: "Pantai Krakal", dist: "3 km" } ].map((loc, i) => (
                        <div key={i} className="flex justify-between items-center border-b border-neutral-100 pb-3 min-h-[32px]">
                           <span className="text-[13px] font-medium text-neutral-700">{loc.name}</span>
                           <span className="text-[11px] font-bold tracking-widest text-[#8A6D00]">{lang === 'en' ? loc.dist.replace(',', '.') : loc.dist}</span>
                        </div>
                     ))}
                  </div>
                </div>
              </ScrollReveal>
              <ScrollReveal variant="blur" delay={0.3} className="h-[350px] md:h-full md:min-h-[400px] w-full bg-neutral-100 rounded-sm overflow-hidden shadow-inner relative group">
                 {mapLoaded ? (
                   <iframe title={tr('Peta Lokasi H One Resort', 'H One Resort Location Map')} src="https://maps.google.com/maps?q=H%20One%20Resort,%20Kota%20Contoh&t=&z=15&ie=UTF8&iwloc=&output=embed" width="100%" height="100%" style={{ border: 0 }} allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="absolute inset-0"></iframe>
                 ) : (
                   <div ref={mapRef} className="w-full h-full bg-neutral-100 flex items-center justify-center text-neutral-400 text-sm tracking-widest uppercase">{tr('Memuat peta...', 'Loading map...')}</div>
                 )}
                 <div className="absolute bottom-6 left-6 bg-white/90 backdrop-blur-sm p-4 text-[10px] uppercase tracking-widest font-bold text-black border border-neutral-200 pointer-events-none">{tr('Jelajahi Peta', 'Explore Map')}</div>
              </ScrollReveal>
            </div>
          </section>

          {/* === TESTIMONIALS MARQUEE === */}
          <section id="testimonials" className="py-20 md:py-32 bg-neutral-50 overflow-hidden">
            <style dangerouslySetInnerHTML={{__html: `
              @keyframes marquee-rtl {
                0% { transform: translateX(0); }
                100% { transform: translateX(-50%); }
              }
              .marquee-track { animation: marquee-rtl 50s linear infinite; }
              .marquee-track:hover { animation-play-state: paused; }
            `}} />
            <ScrollReveal variant="fadeUp" className="text-center mb-12 md:mb-16 max-w-7xl mx-auto px-4">
              <p className="text-[#8A6D00] font-bold tracking-[0.4em] text-[10px] mb-4 uppercase italic">{tr('Cerita Tamu', 'Guest Stories')}</p>
              <WordReveal text={tr('Kata Tamu Kami', 'What Our Guests Say')} as="h2" className="text-2xl md:text-4xl font-serif text-black uppercase tracking-wide justify-center" />
              <div className="h-[1px] w-16 md:w-24 bg-[#D4AF37]/50 mx-auto mt-6 md:mt-8"></div>
            </ScrollReveal>

            {(() => {
              const reviews = [
                { name: "Tamu Contoh 1", rating: 5, date: "Sep 2026", text: "Kamar luas dan nyaman, staf ramah, proses booking cepat. Sangat direkomendasikan." },
                { name: "Tamu Contoh 2", rating: 5, date: "Sep 2026", text: "Harga sebanding dengan fasilitas. Kolam renang pribadi dan pemandangan yang indah." },
                { name: "Guest Example 3", rating: 5, date: "Aug 2026", text: "Great stay, friendly staff, comfortable room and a good breakfast." },
                { name: "Tamu Contoh 4", rating: 5, date: "Aug 2026", text: "Pelayanan sangat baik dan makanannya enak. Semoga terus terjaga kualitasnya." },
                { name: "Tamu Contoh 5", rating: 5, date: "Aug 2026", text: "Menginap semalam di sini, suasananya unik dan berbeda dari yang lain." },
                { name: "Tamu Contoh 6", rating: 5, date: "Jul 2026", text: "Tempat yang cocok untuk melepas penat. Kamar bersih dan staf sangat membantu." },
              ];
              const doubled = [...reviews, ...reviews];
              return (
                <div className="relative">
                  <div className="absolute left-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-r from-neutral-50 to-transparent z-10 pointer-events-none" />
                  <div className="absolute right-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-l from-neutral-50 to-transparent z-10 pointer-events-none" />
                  <div className="flex marquee-track" style={{ width: 'max-content' }}>
                    {doubled.map((review, i) => (
                      <div key={i} className="bg-white p-6 md:p-8 rounded-sm shadow-sm border border-neutral-100 flex flex-col mx-3 md:mx-4" style={{ width: '300px', flexShrink: 0 }}>
                        <div className="flex gap-0.5 mb-3">
                          {[...Array(review.rating)].map((_, j) => (
                            <svg key={j} className="w-3.5 h-3.5 text-[#D4AF37] fill-current" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                          ))}
                        </div>
                        <p className="text-neutral-600 font-light leading-relaxed text-[13px] flex-grow mb-5 italic">"{review.text}"</p>
                        <div className="border-t border-neutral-100 pt-3 flex justify-between items-center">
                          <span className="font-semibold text-[12px] text-neutral-800">{review.name}</span>
                          <span className="text-[9px] text-neutral-400 uppercase tracking-widest">{reviewDate(review.date, lang)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-center mt-10 md:mt-12">
              <a href="https://maps.app.goo.gl/EXAMPLE" target="_blank" rel="noopener noreferrer" onClick={() => trackOutbound('google_maps', 'contact_section')} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-500 hover:text-[#D4AF37] transition-colors duration-200 touch-action-manipulation focus-ring">
                {tr('Lihat semua ulasan di Google', 'See all reviews on Google')} <ArrowUpRight size={14} />
              </a>
            </div>
          </section>

          {/* === INSTAGRAM FEED === */}
          <section id="instagram-feed" className="py-20 md:py-32 bg-black">
            <ScrollReveal variant="fadeUp" className="text-center mb-10 md:mb-16 max-w-7xl mx-auto px-4">
              <p className="text-[#D4AF37] font-bold tracking-[0.4em] text-[10px] mb-4 uppercase italic">@honeresort</p>
              <WordReveal text={tr('Ikuti Cerita Kami', 'Follow Our Story')} as="h2" className="text-2xl md:text-4xl font-serif text-[#D7AB1D] uppercase tracking-wide justify-center" />
              <div className="h-[1px] w-16 md:w-24 bg-[#D4AF37]/50 mx-auto mt-6 md:mt-8"></div>
            </ScrollReveal>
            <div className="max-w-7xl mx-auto px-4">
              <behold-widget feed-id="gfbJD0LdhXgvYuiLcljC"></behold-widget>
            </div>
            <ScrollReveal variant="fadeUp" delay={0.3} className="flex justify-center mt-10">
              <a href="https://www.instagram.com/honeresort/" target="_blank" rel="noopener noreferrer" onClick={() => trackSocial('instagram', 'instagram_feed')} className="flex items-center gap-3 border border-white/30 text-white hover:bg-[#D4AF37] hover:border-[#D4AF37] hover:text-white transition-all duration-300 px-8 py-3 text-[10px] font-bold uppercase tracking-[0.3em] focus-ring touch-action-manipulation">
                <Instagram size={14} /> {tr('Ikuti', 'Follow')} @honeresort
              </a>
            </ScrollReveal>
          </section>


          {/* Floating WhatsApp Button */}
          {/* FAB social menu */}
          <div className="fixed bottom-24 right-4 z-[9999] md:bottom-8 md:right-6 flex flex-col items-end gap-2">
            {/* Options */}
            <div className={`flex flex-col items-end gap-2 transition-all duration-300 ${fabOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
              {[
                { label: 'Instagram', icon: <Instagram size={16} />, href: 'https://www.instagram.com/honeresort/' },
                { label: 'TikTok',    icon: <TiktokIcon size={16} />, href: 'https://www.tiktok.com/@honeresort' },
                { label: 'Facebook',  icon: <Facebook size={16} />, href: 'https://www.facebook.com/honeresort' },
                { label: 'Maps',      icon: <MapPin size={16} />, href: 'https://maps.app.goo.gl/EXAMPLE' },
              ].map((opt, i) => (
                <a
                  key={opt.label}
                  href={opt.href}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => opt.label === 'Maps' ? trackOutbound('google_maps', 'floating_dock') : trackSocial(opt.label.toLowerCase(), 'floating_dock')}
                  style={{ transitionDelay: fabOpen ? `${i * 40}ms` : '0ms' }}
                  className={`flex items-center gap-2 bg-[#D4AF37] hover:bg-[#c49e2e] backdrop-blur-sm text-white px-4 py-2.5 rounded-xl shadow-[0_0_20px_rgba(212,175,55,0.3)] text-[12px] font-semibold tracking-wide transition-all duration-300 ${fabOpen ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}
                >
                  {opt.icon}
                  <span>{opt.label}</span>
                </a>
              ))}
            </div>
            {/* Toggle button */}
            <button
              onClick={() => setFabOpen(p => !p)}
              aria-label={tr('Tautan media sosial', 'Social links')}
              className="w-12 h-12 rounded-full bg-[#D4AF37] hover:bg-[#c49e2e] backdrop-blur-sm text-white shadow-[0_0_20px_rgba(212,175,55,0.4)] flex items-center justify-center transition-all duration-300 active:scale-95"
            >
              <Plus size={22} className={`transition-transform duration-300 ${fabOpen ? 'rotate-45' : 'rotate-0'}`} />
            </button>
          </div>
        </main>
      )}

      {activePage === 'loading' && <div className="min-h-screen" />}
      {isNotFound && (
        <div className="min-h-[72vh] flex flex-col items-center justify-center text-center px-6 pt-32 pb-24 bg-white animate-in fade-in duration-500">
          <p className="text-[#8A6D00] font-bold tracking-[0.4em] text-[10px] mb-4 uppercase italic">404</p>
          <h1 className="font-serif text-4xl md:text-6xl text-neutral-900 tracking-wide mb-6 uppercase">{tr('Halaman Tidak Ditemukan', 'Page Not Found')}</h1>
          <p className="text-neutral-500 font-light leading-relaxed text-sm md:text-base max-w-md mb-10">{tr('Maaf, halaman yang Anda cari tidak tersedia atau telah dipindahkan.', 'Sorry, the page you are looking for is unavailable or has been moved.')}</p>
          <button onClick={() => { navigate('/'); window.scrollTo({ top: 0 }); }} className="bg-black text-[#D4AF37] px-10 py-4 text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-neutral-800 transition-colors duration-200 rounded-sm focus-ring touch-action-manipulation">{tr('Kembali ke Beranda', 'Back to Home')}</button>
        </div>
      )}

      {activePage === 'rooms' && (
        <Suspense fallback={<div className="min-h-screen" />}>
          <RoomsPage navigate={navigate} scrollToBooking={scrollToBooking} roomsData={roomsList} />
        </Suspense>
      )}

      {activePage === 'package-detail' && selectedPackageId && packageDetails[selectedPackageId] && (
        <Suspense fallback={<div className="min-h-screen" />}>
          <PackageDetailPage navigate={navigate} selectedPackageId={selectedPackageId} data={packageDetails[selectedPackageId]} handleGeneralInquiry={handleGeneralInquiry} />
        </Suspense>
      )}

      {activePage === 'meetings' && (
        <Suspense fallback={<div className="min-h-screen" />}>
          <MeetingsPage navigate={navigate} handleGeneralInquiry={handleGeneralInquiry} packages={meetingData?.details} />
        </Suspense>
      )}

      {activePage === 'gallery' && (
        <div className="min-h-screen bg-stone-50 font-sans animate-in fade-in duration-500 pb-24">
          <div className="relative h-[100svh] flex items-center justify-center overflow-hidden">
            <video autoPlay loop muted playsInline preload="none" className="absolute inset-0 w-full h-full object-cover">
              <source src="https://res.cloudinary.com/YOUR_CLOUD_NAME/video/fetch/q_auto/https://i.imgur.com/Rl1cnO6.mp4" type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative z-10 text-center text-white px-4">
              <h1 className="text-5xl md:text-8xl font-serif font-light tracking-wide mb-4 uppercase text-[#D7AB1D]">{tr('Galeri', 'Gallery')}</h1>
              <p className="text-sm md:text-xl font-light tracking-widest uppercase text-white/80">H One Resort — The Luxury of Nature</p>
            </div>
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/60 animate-bounce">
              <span className="text-xs tracking-widest uppercase">{tr('Gulir', 'Scroll')}</span>
              <ChevronDown size={20} />
            </div>
          </div>

          <div className="text-center py-20 px-4 max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-serif text-gray-800 mb-6 uppercase tracking-wide">{tr('Momen di H One', 'Moments at H One')}</h2>
            <p className="text-gray-500 text-sm md:text-base leading-relaxed font-light">{tr('Dari lanskap pesisir selatan hingga presisi detail di setiap sanctuary — setiap bidikan adalah undangan untuk mengalaminya secara langsung.',
              'From the southern coastal landscape to the precision of detail in every sanctuary — each frame is an invitation to experience it in person.')}</p>
          </div>

          <div className="flex flex-wrap justify-center gap-3 px-4 mb-12">
            {categories.map((cat) => (
              <button key={cat} onClick={() => { setActiveCategory(cat); trackEvent('gallery_filter', { event_category: 'engagement', event_label: cat, gallery_category: cat, click_location: 'gallery_page' }); }} className={`px-6 py-2.5 text-[10px] md:text-xs font-bold tracking-widest uppercase border rounded-full transition-all duration-300 touch-action-manipulation focus-ring ${activeCategory === cat ? "bg-gray-900 text-white border-gray-900" : "bg-transparent text-gray-600 border-gray-300 hover:border-gray-900 hover:text-gray-900"}`}>{catLabel(cat)}</button>
            ))}
          </div>

          <div className="max-w-7xl mx-auto px-6 pb-20">
            <Suspense fallback={<div className="w-full h-96 bg-neutral-100 animate-pulse rounded-lg" />}>
              <div className="columns-1 sm:columns-2 lg:columns-3 gap-6">
                {filteredGallery.slice(0, visibleCount).map((item, idx) => (
                  <ScrollReveal key={item.id} variant="fadeUp" delay={(idx % 3) * 0.1} className="break-inside-avoid mb-6">
                    <GalleryCard item={item} onClick={setSelectedGalleryItem} />
                  </ScrollReveal>
                ))}
              </div>
            </Suspense>

            {filteredGallery.length === 0 && (
              <div className="text-center py-20 text-neutral-400 text-sm tracking-widest uppercase font-light">{tr('Konten sedang diperbarui', 'Assets are currently being updated')}</div>
            )}

            {visibleCount < filteredGallery.length && (
              <div className="flex justify-center mt-10">
                <button onClick={() => setVisibleCount(v => v + 24)} className="border border-neutral-300 text-neutral-600 hover:bg-black hover:border-black hover:text-white transition-all duration-300 px-8 py-3 text-[10px] font-bold uppercase tracking-[0.2em] rounded-full focus-ring touch-action-manipulation">{tr(`Muat Lebih Banyak (${filteredGallery.length - visibleCount} lagi)`, `Load More (${filteredGallery.length - visibleCount} remaining)`)}</button>
              </div>
            )}
          </div>

          <div className="max-w-7xl mx-auto px-6 flex justify-center pb-12 mt-8">
            <button onClick={() => { navigate('/'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="flex items-center justify-center text-neutral-500 hover:text-black text-[10px] font-bold uppercase tracking-[0.2em] transition-colors duration-200 group w-fit min-h-[48px] touch-action-manipulation focus-ring">
              <ChevronLeft size={16} className="mr-2 md:group-hover:-translate-x-1 transition-transform duration-200" /> {tr('Kembali ke Beranda', 'Back to Home')}
            </button>
          </div>
        </div>
      )}

      <Suspense fallback={null}>
        <GalleryLightbox item={selectedGalleryItem} onClose={() => setSelectedGalleryItem(null)} onPrev={handleGalleryPrev} onNext={handleGalleryNext} />
      </Suspense>

      {/* ─── PRICELIST PAGE ─── */}
      {activePage === 'pricelist' && (
        <div className="min-h-screen bg-neutral-50 pt-28 md:pt-32 pb-32 px-6">
          <div className="max-w-5xl mx-auto">
            <button onClick={() => { navigate('/'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="flex items-center text-neutral-500 hover:text-black mb-8 md:mb-10 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors duration-200 group w-fit min-h-[48px] touch-action-manipulation focus-ring">
              <ChevronLeft size={16} className="mr-2 md:group-hover:-translate-x-1 transition-transform duration-200" /> {tr('Kembali ke Beranda', 'Back to Home')}
            </button>

            <div className="mb-10 md:mb-14 text-center">
              <p className="text-[#8A6D00] font-bold tracking-[0.3em] text-[10px] mb-3 uppercase font-serif">H One Resort</p>
              <h1 className="font-serif text-3xl md:text-4xl text-neutral-900 tracking-wide mb-4">{tr('Daftar Harga', 'Price List')}</h1>
              <p className="text-neutral-600 text-[18px] font-bold leading-relaxed tracking-wide">{tr('Harga per kamar per malam', 'Price per room per night')}</p>
              <p className="text-neutral-500 text-[13px] mt-1">{tr('Harga belum termasuk pajak & service 16%', 'Prices exclude 16% tax & service')}</p>
              <p className="text-neutral-400 text-[13px] font-light leading-relaxed mt-3 max-w-xl mx-auto">{tr('Untuk memastikan ketersediaan kamar, kami mengimbau tamu untuk melakukan konfirmasi ulang kepada tim reservasi kami melalui nomor hotline yang tersedia sebelum melakukan pemesanan.',
                'To make sure a room is available, we kindly ask guests to reconfirm with our reservations team through the available hotline before booking.')}</p>
            </div>

            <Suspense fallback={<div className="h-72 rounded-[12px] bg-white border border-neutral-100 animate-pulse" />}>
              <PricelistCalendar
                rooms={roomTypes.map(name => ({ name, code: ROOM_FIELD_MAP[name] }))}
                nightOf={nightOf}
                libur={libur}
                taxPercent={16}
                onMonthShown={loadEngineMonth}
                onBook={bookFromCalendar}
              />
            </Suspense>

            <div className="mt-8 pt-6 border-t border-neutral-200 flex flex-col items-center gap-4">
              <p className="text-[10px] text-neutral-400 tracking-wider leading-relaxed text-center">
                {tr('* Harga dapat berubah sewaktu-waktu. Untuk info lebih lanjut hubungi tim kami via WhatsApp.', '* Prices are subject to change at any time. For more information, please contact our team via WhatsApp.')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── PRICELIST BOOKING MODAL ─── */}
      {plModal.open && (
        <div className="fixed inset-0 z-[250] flex items-end md:items-center justify-center" onClick={closePlModal} onWheel={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300" />
          <div
            className="relative w-full md:max-w-md bg-white md:rounded-[24px] rounded-t-[24px] shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col animate-in slide-in-from-bottom-6 md:slide-in-from-bottom-4 duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-neutral-900 px-6 py-5 flex items-start justify-between shrink-0">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-[#D4AF37] mb-1">{periodLabelFor(plModal.periodLabel, lang)}</p>
                <p className="text-white font-serif text-[15px] tracking-wide">{plModal.roomType}</p>
              </div>
              <button aria-label={tr('Tutup', 'Close')} onClick={closePlModal} className="text-white/60 hover:text-white transition-colors p-1 mt-0.5 touch-action-manipulation"><X size={20} /></button>
            </div>

            {/* Form body — smooth scroll, momentum on iOS */}
            <div
              className="overflow-y-auto flex-1 px-6 py-6 space-y-5 scroll-smooth overscroll-contain"
              style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
              onTouchMove={e => e.stopPropagation()}
              onWheel={e => e.stopPropagation()}
            >
              {/* Dates */}
              <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-75">
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-[0.25em] text-neutral-400 mb-2">Check-in</label>
                  <button
                    type="button"
                    onClick={() => { setPlActivePick('from'); setPlDateOpen(true); }}
                    className={`w-full border rounded-[8px] px-3 py-2.5 text-left flex items-center gap-2 transition-all duration-200 touch-action-manipulation ${plDateOpen && plActivePick === 'from' ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/20' : 'border-neutral-200 hover:border-[#D4AF37]'}`}
                  >
                    <Calendar size={13} className={`shrink-0 transition-colors duration-200 ${plDateOpen && plActivePick === 'from' ? 'text-[#D4AF37]' : 'text-neutral-300'}`} />
                    <span className={`text-[12px] truncate ${plModal.checkIn ? 'text-neutral-800' : 'text-neutral-300'}`}>
                      {plModal.checkIn ? formatPlDate(plModal.checkIn) : tr('Pilih tanggal', 'Select date')}
                    </span>
                  </button>
                </div>
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-[0.25em] text-neutral-400 mb-2">Check-out</label>
                  <button
                    type="button"
                    onClick={() => { setPlActivePick('to'); setPlDateOpen(true); }}
                    className={`w-full border rounded-[8px] px-3 py-2.5 text-left flex items-center gap-2 transition-all duration-200 touch-action-manipulation ${plDateOpen && plActivePick === 'to' ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/20' : 'border-neutral-200 hover:border-[#D4AF37]'}`}
                  >
                    <Calendar size={13} className={`shrink-0 transition-colors duration-200 ${plDateOpen && plActivePick === 'to' ? 'text-[#D4AF37]' : 'text-neutral-300'}`} />
                    <span className={`text-[12px] truncate ${plModal.checkOut ? 'text-neutral-800' : 'text-neutral-300'}`}>
                      {plModal.checkOut ? formatPlDate(plModal.checkOut) : tr('Pilih tanggal', 'Select date')}
                    </span>
                  </button>
                </div>
              </div>

              {/* Guests */}
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-150">
                <label className="block text-[9px] font-bold uppercase tracking-[0.25em] text-neutral-400 mb-3">{tr('Tamu', 'Guests')}</label>
                <div className="flex gap-4">
                  {([{ label: tr('Kamar', 'Rooms'), key: 'rooms', min: 1 }, { label: tr('Dewasa', 'Adults'), key: 'adults', min: 1 }, { label: tr('Anak', 'Children'), key: 'children', min: 0 }] as const).map(g => (
                    <div key={g.key} className="flex-1 flex flex-col items-center gap-2">
                      <span className="text-[9px] uppercase tracking-widest text-neutral-400">{g.label}</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setPlModal(prev => ({ ...prev, [g.key]: Math.max(g.min, prev[g.key] - 1) }))} className="w-7 h-7 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-500 hover:border-[#D4AF37] hover:text-[#D4AF37] transition-colors touch-action-manipulation active:scale-95"><Minus size={12} /></button>
                        <span className="text-[14px] font-bold w-5 text-center tabular-nums">{plModal[g.key]}</span>
                        <button disabled={g.key === 'rooms' && plModal.rooms >= plHardMax} onClick={() => g.key === 'rooms' ? plAddRoom() : setPlModal(prev => ({ ...prev, [g.key]: prev[g.key] + 1 }))} className="w-7 h-7 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-500 hover:border-[#D4AF37] hover:text-[#D4AF37] transition-colors touch-action-manipulation active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-neutral-200 disabled:hover:text-neutral-500"><Plus size={12} /></button>
                      </div>
                    </div>
                  ))}
                </div>
                {scarcityText(tr, plLeft, true) && (
                  <p className="mt-3 flex gap-2 items-start rounded-[8px] bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700 animate-in fade-in duration-300">
                    <Flame size={14} className="shrink-0 mt-px" /> {scarcityText(tr, plLeft, true)}
                  </p>
                )}
              </div>

              {/* Name */}
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200">
                <label className="block text-[9px] font-bold uppercase tracking-[0.25em] text-neutral-400 mb-2">{tr('Nama Lengkap', 'Full Name')}</label>
                <input type="text" value={plModal.name} onChange={e => setPlModal(prev => ({ ...prev, name: e.target.value }))} placeholder={tr('Masukkan nama lengkap', 'Enter your full name')} className="w-full border border-neutral-200 rounded-[8px] px-3 py-2.5 text-[12px] text-neutral-800 placeholder:text-neutral-300 focus:outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 transition-all duration-200" />
              </div>

              {/* WA */}
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-[225ms]">
                <label className="block text-[9px] font-bold uppercase tracking-[0.25em] text-neutral-400 mb-2">{tr('Nomor WhatsApp', 'WhatsApp Number')}</label>
                <input type="tel" value={plModal.wa} onChange={e => setPlModal(prev => ({ ...prev, wa: e.target.value }))} placeholder="08xx xxxx xxxx" className="w-full border border-neutral-200 rounded-[8px] px-3 py-2.5 text-[12px] text-neutral-800 placeholder:text-neutral-300 focus:outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 transition-all duration-200" />
              </div>

              {/* Voucher / referral code from sales */}
              {BOOKING_ENGINE && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-[240ms]">
                  <label className="block text-[9px] font-bold uppercase tracking-[0.25em] text-neutral-400 mb-2">{tr('Kode Voucher', 'Voucher Code')} <span className="normal-case tracking-normal font-normal">{tr('(opsional)', '(optional)')}</span></label>
                  <input type="text" value={plModal.voucher} maxLength={30} autoCapitalize="characters" onChange={e => setPlModal(prev => ({ ...prev, voucher: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') }))} placeholder={tr('Contoh: LOWSEASON10', 'e.g. LOWSEASON10')} className="w-full border border-neutral-200 rounded-[8px] px-3 py-2.5 text-[12px] uppercase tracking-wider text-neutral-800 placeholder:normal-case placeholder:tracking-normal placeholder:text-neutral-300 focus:outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 transition-all duration-200" />
                  <p className="mt-1 text-[10px] text-neutral-400">{tr('Potongan dihitung otomatis saat pembayaran online.', 'The discount is applied automatically at online checkout.')}</p>
                </div>
              )}

              {/* Request — smooth expand via grid-rows transition */}
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-[250ms]">
                <button
                  onClick={() => setPlReqOpen(p => !p)}
                  className={`flex items-center justify-between w-full border rounded-[8px] px-3 py-3 touch-action-manipulation transition-all duration-300 ${plReqOpen ? 'border-[#D4AF37] bg-neutral-50' : 'border-neutral-200 bg-white'}`}
                >
                  <span className={`text-[12px] uppercase tracking-[0.2em] transition-colors duration-200 ${plReqOpen || plModal.requests.length > 0 ? 'text-neutral-700' : 'text-neutral-400'}`}>
                    {plModal.requests.length === 0 ? tr('Special Request (opsional)', 'Special Request (optional)') : plModal.requests.includes(NO_REQUEST) ? tr('Tidak ada request', 'No requests') : tr(`${plModal.requests.length} request dipilih`, `${plModal.requests.length} requests selected`)}
                  </span>
                  <ChevronDown size={16} className={`text-neutral-400 transition-transform duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${plReqOpen ? 'rotate-180 text-[#D4AF37]' : ''}`} />
                </button>

                {/* Smooth expand via grid-rows */}
                <div className={`grid transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${plReqOpen ? 'grid-rows-[1fr] mt-2' : 'grid-rows-[0fr]'}`}>
                  <div className="overflow-hidden">
                    <div className="border border-neutral-100 rounded-[8px] p-3 space-y-1">
                      {requestOptions.map((opt, i) => (
                        <label
                          key={opt}
                          onClick={() => togglePlRequest(opt)}
                          aria-disabled={addonFull(opt, plModal.checkIn) || undefined}
                          className={`flex items-center gap-3 py-2 px-2 rounded-[6px] transition-colors duration-150 touch-action-manipulation
                            ${addonFull(opt, plModal.checkIn) && !plModal.requests.includes(opt) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                            ${plModal.requests.includes(opt) ? 'bg-[#D4AF37]/8' : 'hover:bg-neutral-50'}`}
                          style={{ animationDelay: `${i * 30}ms` }}
                        >
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all duration-200 shrink-0 ${plModal.requests.includes(opt) ? 'bg-[#D4AF37] border-[#D4AF37] scale-110' : 'border-neutral-300'}`}>
                            {plModal.requests.includes(opt) && <Check size={9} className="text-black" strokeWidth={3} />}
                          </div>
                          <span className={`text-[12px] transition-colors duration-150 ${plModal.requests.includes(opt) ? 'text-neutral-800 font-medium' : 'text-neutral-500'}`}>{reqLabel(opt)}{addonFull(opt, plModal.checkIn) && <span className="ml-1.5 text-[10px] text-red-500">{tr('(penuh)', '(full)')}</span>}</span>
                          {reqPrice(opt) && (
                            <span className="ml-auto text-[10px] text-neutral-400 font-medium tabular-nums">{reqPrice(opt)}</span>
                          )}
                        </label>
                      ))}
                      {plModal.requests.includes('Other') && (
                        <input type="text" value={plModal.otherRequest} onChange={e => setPlModal(prev => ({ ...prev, otherRequest: e.target.value }))} placeholder={tr('Tulis request lainnya...', 'Write your other request...')} className="w-full border border-neutral-200 rounded-[6px] px-3 py-2 text-[12px] mt-2 focus:outline-none focus:border-[#D4AF37] animate-in fade-in slide-in-from-top-1 duration-300" />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* bottom padding so last item clears CTA */}
              <div className="h-2" />
            </div>

            {/* CTA */}
            <div className="px-6 py-4 border-t border-neutral-100 shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] flex flex-col gap-2">
              {plH2Blocked && <p role="alert" className="text-center text-[12px] text-red-600">{h2Message(tr)}</p>}
              {BOOKING_ENGINE && (
                <button onClick={handlePlPayOnline} disabled={plH2Blocked} className="w-full bg-[#D4AF37] text-black font-bold uppercase tracking-[0.3em] text-[11px] py-4 rounded-[8px] hover:bg-black hover:text-[#D4AF37] transition-colors duration-300 flex items-center justify-center gap-3 touch-action-manipulation active:scale-[0.98] focus-ring disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#D4AF37] disabled:hover:text-black">
                  {tr('Bayar Online', 'Pay Online')} <ArrowRight size={14} />
                </button>
              )}
              <button onClick={handlePlBookNow} disabled={plH2Blocked} className="w-full bg-black text-[#D4AF37] font-bold uppercase tracking-[0.3em] text-[11px] py-4 rounded-[8px] hover:bg-[#D4AF37] hover:text-black transition-colors duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-black disabled:hover:text-[#D4AF37] flex items-center justify-center gap-3 touch-action-manipulation active:scale-[0.98] focus-ring">
                {BOOKING_ENGINE ? tr('Pesan via WhatsApp', 'Book via WhatsApp') : tr('Pesan Sekarang', 'Book Now')} <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {plUpsell && (
            <RoomAlternatives title={plUpsell.title}
              note={tr(`Anda butuh ${plUpsell.need} kamar. Pilih tipe lain yang masih cukup:`, `You need ${plUpsell.need} rooms. Choose another type that can still take your group:`)}
              options={plUpsell.options} basePerNight={plUpsell.base}
              onPick={plTakeAlternative} onClose={() => setPlUpsell(null)} waHref={waGeneralLink}
              konteks={{ kamar: ROOM_FIELD_MAP[plModal.roomType], checkin: plModal.checkIn, checkout: plModal.checkOut, tempat: 'form', alasan: 'kurang' }} />
          )}

          {/* DayPicker overlay — z above modal, same style as homepage */}
          {plDateOpen && (
            <div className="fixed inset-0 z-[400]" onClick={() => setPlDateOpen(false)}>
              <div
                className="absolute bottom-0 left-0 w-full bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.15)] px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] rounded-t-[20px] md:bottom-auto md:left-1/2 md:-translate-x-1/2 md:w-auto md:rounded-[16px] md:shadow-2xl md:px-5 md:pt-4 md:pb-5 animate-in slide-in-from-bottom-4 md:zoom-in-95 duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ maxHeight: '80dvh', overflowY: 'auto' }}
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] font-light uppercase tracking-[0.25em] text-[#8A6D00]">
                    {plActivePick === 'from' ? tr('Pilih check-in', 'Select check-in') : !plModal.checkOut ? tr('Pilih check-out →', 'Select check-out →') : tr('Tanggal terpilih ✓', 'Dates selected ✓')}
                  </span>
                  <button aria-label={tr('Tutup', 'Close')} onClick={() => setPlDateOpen(false)} className="p-1 text-neutral-400 hover:text-neutral-800 transition-colors"><X size={16}/></button>
                </div>
                <Suspense fallback={<div className="h-48 flex items-center justify-center text-neutral-400 text-xs">{tr('Memuat...', 'Loading...')}</div>}>
                  <DayDataContext.Provider value={{ libur, priceOf: nightPriceOf(plModal.roomType) }}>
                  {plActivePick === 'from' ? (
                    <DayPicker
                      mode="single"
                      locale={dpLocale(lang)}
                      selected={parsePlDate(plModal.checkIn)}
                      onSelect={(date: Date | undefined) => {
                        if (!date) { setPlDateOpen(false); return; }
                        const ds = toPlDateStr(date);
                        setPlModal(prev => ({ ...prev, checkIn: ds, checkOut: '' }));
                        setPlDateOpen(false);
                      }}
                      disabled={(date: Date) => {
                        const ds = toPlDateStr(date);
                        if (BOOKING_ENGINE) return !canCheckIn(ds, plNight, toPlDateStr(new Date()));
                        const ciSet = new Set(plModal.checkInDates);
                        return !ciSet.has(ds);
                      }}
                      defaultMonth={parsePlDate(plModal.minDate)}
                      numberOfMonths={1}
                      components={DAY_COMPONENTS}
                      className="rdp-hone rdp-priced"
                    />
                  ) : (
                    <DayPicker
                      mode="single"
                      locale={dpLocale(lang)}
                      selected={parsePlDate(plModal.checkOut)}
                      onSelect={(date: Date | undefined) => {
                        if (!date) { setPlDateOpen(false); return; }
                        const ds = toPlDateStr(date);
                        setPlModal(prev => {
                          const left = BOOKING_ENGINE && prev.checkIn ? roomsLeft(prev.checkIn, ds, plNight) : undefined;
                          return { ...prev, checkOut: ds, rooms: left ? Math.min(prev.rooms, left) : prev.rooms };
                        });
                        setPlDateOpen(false);
                      }}
                      disabled={(date: Date) => {
                        const ds = toPlDateStr(date);
                        if (BOOKING_ENGINE) return !plModal.checkIn || !canCheckOut(plModal.checkIn, ds, plNight);
                        const coSet = new Set(plModal.checkInDates.map(d => addDays(d, 1)));
                        const minCO = plModal.checkIn ? addDays(plModal.checkIn, 1) : '';
                        return !coSet.has(ds) || (minCO ? ds < minCO : false);
                      }}
                      defaultMonth={parsePlDate(plModal.checkIn || plModal.minDate)}
                      numberOfMonths={1}
                      components={DAY_COMPONENTS}
                      className="rdp-hone rdp-priced"
                    />
                  )}
                  </DayDataContext.Provider>
                </Suspense>
                <button onClick={() => setPlDateOpen(false)} className="md:hidden w-full min-h-[44px] py-3 mt-1 bg-black text-[#D4AF37] text-[12px] font-bold uppercase tracking-[0.4em] rounded-[8px]">{tr('Konfirmasi', 'Confirm')}</button>
              </div>
            </div>
          )}
        </div>
      )}

      <footer className="bg-white border-t border-neutral-100 pt-16 md:pt-20 pb-32 lg:pb-36 px-6 overflow-hidden">
        <ScrollReveal variant="fadeUp" className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start gap-8 md:gap-0">
            <div className="flex flex-col items-start w-full md:w-1/2">
              <p className="text-[#8A6D00] font-bold tracking-[0.2em] text-[10px] md:text-[11px] mb-4 uppercase">H One Resort</p>
              <a href="https://maps.app.goo.gl/EXAMPLE" target="_blank" rel="noopener noreferrer" onClick={() => trackOutbound('google_maps', 'footer')} className="group cursor-pointer max-w-[300px] touch-action-manipulation focus-ring mb-6 md:mb-8 block">
                <p className="text-[11px] md:text-[13px] font-sans font-medium text-neutral-800 leading-relaxed tracking-wide group-hover:text-[#D4AF37] transition-colors duration-200">
                  {siteSettings.alamat || 'Jl. Contoh No. 1, Kota Contoh, Provinsi Contoh 00000'} <ArrowUpRight size={14} className="inline mb-0.5 ml-1 opacity-50 group-hover:opacity-100 transition-opacity" />
                </p>
              </a>
              <div className="text-[9px] md:text-[11px] font-medium tracking-[0.05em] text-neutral-500 flex flex-col gap-1.5 md:gap-2 max-w-[300px]">
                <p>&copy; {new Date().getFullYear()} H One Resort. {tr('Hak cipta dilindungi.', 'All Rights Reserved.')}</p>
                <p>{tr('Syarat & Ketentuan | Kebijakan Privasi', 'Terms & Conditions | Privacy Policy')}</p>
              </div>
            </div>

            <div className="flex flex-col md:items-end w-full md:w-1/2 border-t border-neutral-100 md:border-t-0 pt-6 md:pt-0">
              <div className="flex flex-col items-start w-full md:w-auto">
                <p className="text-[#8A6D00] font-bold tracking-[0.2em] text-[10px] md:text-[11px] mb-6 uppercase m-0">{tr('Hubungi Kami', 'Get in Touch')}</p>
                
                {/* Mobile View */}
                <div className="flex md:hidden items-center gap-6">
                  <a href="https://www.instagram.com/honeresort/" target="_blank" rel="noopener noreferrer" onClick={() => trackSocial('instagram', 'footer_social')} className="text-[#D4AF37] active:scale-95 transition-transform touch-action-manipulation focus-ring"><Instagram size={20} /></a>
                  <a href="https://www.tiktok.com/@honeresort" target="_blank" rel="noopener noreferrer" onClick={() => trackSocial('tiktok', 'footer_social')} className="text-[#D4AF37] active:scale-95 transition-transform touch-action-manipulation focus-ring"><TiktokIcon size={20} /></a>
                  <a href="https://www.facebook.com/honeresort/" target="_blank" rel="noopener noreferrer" onClick={() => trackSocial('facebook', 'footer_social')} className="text-[#D4AF37] active:scale-95 transition-transform touch-action-manipulation focus-ring"><Facebook size={20} /></a>
                  <a href={waGeneralLink} target="_blank" rel="noopener noreferrer" onClick={() => handleWaGeneralClick('footer_social_mobile')} className="text-[#D4AF37] active:scale-95 transition-transform touch-action-manipulation focus-ring"><WhatsAppIcon size={20} /></a>
                </div>

                {/* Desktop View */}
                <div className="hidden md:flex flex-col items-start gap-5">
                  <a href="https://www.instagram.com/honeresort/" target="_blank" rel="noopener noreferrer" onClick={() => trackSocial('instagram', 'footer_links')} className="group flex items-center gap-4 cursor-pointer transition-colors duration-200 focus-ring">
                    <Instagram className="text-[#D4AF37] group-hover:scale-110 transition-transform duration-200" size={18} />
                    <span className="text-[13px] font-medium text-neutral-600 group-hover:text-black transition-colors duration-200">@honeresort</span>
                  </a>
                  <a href="https://www.tiktok.com/@honeresort" target="_blank" rel="noopener noreferrer" onClick={() => trackSocial('tiktok', 'footer_links')} className="group flex items-center gap-4 cursor-pointer transition-colors duration-200 focus-ring">
                    <TiktokIcon className="text-[#D4AF37] group-hover:scale-110 transition-transform duration-200" size={18} />
                    <span className="text-[13px] font-medium text-neutral-600 group-hover:text-black transition-colors duration-200">@honeresort</span>
                  </a>
                  <a href="https://www.facebook.com/honeresort/" target="_blank" rel="noopener noreferrer" onClick={() => trackSocial('facebook', 'footer_links')} className="group flex items-center gap-4 cursor-pointer transition-colors duration-200 focus-ring">
                    <Facebook className="text-[#D4AF37] group-hover:scale-110 transition-transform duration-200" size={18} />
                    <span className="text-[13px] font-medium text-neutral-600 group-hover:text-black transition-colors duration-200">H One Resort</span>
                  </a>
                  <a href={waGeneralLink} target="_blank" rel="noopener noreferrer" onClick={() => handleWaGeneralClick('footer_contact_desktop')} className="group flex items-center gap-4 cursor-pointer transition-colors duration-200 focus-ring">
                    <WhatsAppIcon className="text-[#D4AF37] group-hover:scale-110 transition-transform duration-200" size={18} />
                    <span className="text-[13px] font-medium text-neutral-600 group-hover:text-black transition-colors duration-200">{formatWa(resortWa)}</span>
                  </a>
                </div>
              </div>
            </div>

          </div>
        </ScrollReveal>
      </footer>

      {/* FAB - DESKTOP (always visible) */}
      <div
        className="hidden lg:block fixed bottom-10 left-1/2 -translate-x-1/2 z-[140]"
        onMouseEnter={() => { isFabHoveredRef.current = true; }}
        onMouseLeave={() => { isFabHoveredRef.current = false; }}
      >
        <div className="flex items-center bg-[#1c1c1c]/75 backdrop-blur-md border border-white/10 rounded-full px-10 py-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          <div className="pr-8 border-r border-white/20">
            <button onClick={() => { trackEvent('nav_click', { event_category: 'navigation', event_label: 'Pricelist', click_location: 'nav_pricelist_btn' }); navigate('/pricelist'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#D4AF37] hover:text-white transition-colors duration-200 whitespace-nowrap touch-action-manipulation focus-ring">Pricelist</button>
          </div>
          <button onClick={() => { navigate('/'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="flex items-center justify-center gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white hover:text-[#D4AF37] transition-colors duration-200 whitespace-nowrap touch-action-manipulation px-8 focus-ring">
            {tr('Beranda', 'Home')}
          </button>
          <div className="pl-8 border-l border-white/20">
            <button onClick={scrollToBooking} className="text-[#D4AF37] hover:text-white transition-colors duration-200 text-[10px] font-bold uppercase tracking-[0.2em] whitespace-nowrap flex items-center justify-center touch-action-manipulation active:scale-95 focus-ring">{tr('Pesan Sekarang', 'Book Now')}</button>
          </div>
        </div>
      </div>

      {/* FAB - MOBILE (auto-hide: show on scroll, hide when static) */}
      <div
        className={`lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-[140] transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform max-w-[calc(100vw-24px)] w-full pb-[env(safe-area-inset-bottom)] ${floatingBarVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}
        onTouchStart={() => { isFabHoveredRef.current = true; setFloatingBarVisible(true); }}
        onTouchEnd={() => { isFabHoveredRef.current = false; if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current); scrollTimeoutRef.current = setTimeout(() => setFloatingBarVisible(false), 2500); }}
      >
        <div className="flex bg-[#1c1c1c]/75 backdrop-blur-md border border-white/10 rounded-full px-4 py-2 items-center justify-between gap-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)] w-full max-w-[360px] mx-auto">
          <button onClick={() => { trackEvent('nav_click', { event_category: 'navigation', event_label: 'Pricelist', click_location: 'nav_pricelist_btn' }); navigate('/pricelist'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-white text-[10px] font-bold uppercase tracking-[0.1em] px-4 h-[44px] flex items-center justify-center hover:text-[#D4AF37] transition-colors shrink-0">Pricelist</button>
          <div className="w-[1px] h-5 bg-white/20 shrink-0"></div>
          <button onClick={() => { navigate('/'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-white text-[10px] font-bold uppercase tracking-[0.1em] px-4 h-[44px] flex items-center justify-center hover:text-[#D4AF37] transition-colors shrink-0">{tr('Beranda', 'Home')}</button>
          <div className="w-[1px] h-5 bg-white/20 shrink-0"></div>
          <button onClick={scrollToBooking} className="text-[#D4AF37] text-[10px] font-bold uppercase tracking-[0.1em] px-4 h-[44px] flex items-center justify-center hover:text-white transition-colors shrink-0">{tr('Pesan Sekarang', 'Book Now')}</button>
        </div>
      </div>

    </div>
  );
}
