import { ScrollReveal, WordReveal } from '../components/reveal';
import { useLang } from '../lang';
import {
  ChevronLeft, Maximize, BedDouble, Waves, Trees, Bath, Home,
  Coffee, Wifi, Car, Store, Sun, Utensils, CreditCard
} from 'lucide-react';

type Room = { name: string; image: string; size: string; bed: string; tagline: string; desc: string };

export default function RoomsPage({ navigate, scrollToBooking, roomsData }: {
  navigate: (path: string) => void;
  scrollToBooking: (e?: any) => void;
  roomsData: Room[];
}) {
  const { tr } = useLang();
  return (
    <div className="pt-24 md:pt-32 pb-24 animate-in fade-in duration-500 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <button onClick={() => { navigate('/'); setTimeout(() => document.getElementById('rooms')?.scrollIntoView({ behavior: 'smooth' }), 100); }} className="flex items-center text-neutral-500 hover:text-black mb-8 md:mb-10 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors duration-200 group w-fit min-h-[48px] touch-action-manipulation focus-ring">
          <ChevronLeft size={16} className="mr-2 md:group-hover:-translate-x-1 transition-transform duration-200" /> {tr('Kembali ke Beranda', 'Back to Home')}
        </button>
        <ScrollReveal variant="fadeUp" className="text-center mb-16 md:mb-20">
          <p className="text-[#8A6D00] font-bold tracking-[0.4em] text-[10px] mb-4 uppercase italic">{tr('Akomodasi', 'Accommodations')}</p>
          <WordReveal text={tr('Kamar & Suite', 'Rooms & Suites')} as="h1" delay={0.2} stagger={0.1} className="text-3xl md:text-5xl font-serif uppercase tracking-wide justify-center" />
          <p className="text-neutral-500 mt-6 max-w-2xl mx-auto font-light leading-relaxed text-sm md:text-base">{tr('Lima private sanctuary — masing-masing dirancang dengan satu prioritas yang tidak pernah berkompromi: privasi, proporsi ruang, dan kualitas tinggal yang sesungguhnya.', 'Five private sanctuaries, each designed around one uncompromising priority: privacy, generous proportions and a truly restorative stay.')}</p>
        </ScrollReveal>
        <div className="space-y-24 md:space-y-40">
          {roomsData.map((room, idx) => (
            <ScrollReveal key={room.name} id={`room-${room.name.toLowerCase().replace(/[\s/]+/g, '-')}`} variant={idx % 2 !== 0 ? "slideRight" : "slideLeft"} className={`flex flex-col md:flex-row gap-10 md:gap-16 items-center scroll-mt-24 md:scroll-mt-32 ${idx % 2 !== 0 ? 'md:flex-row-reverse' : ''}`}>
              <div className="w-full md:w-3/5 aspect-[4/3] md:aspect-video overflow-hidden rounded-sm shadow-xl md:shadow-2xl">
                <img loading="lazy" decoding="async" src={room.image} alt={room.name} width="800" height="600" className="w-full h-full object-cover transition-transform duration-[1500ms] md:hover:scale-105" />
              </div>
              <div className="w-full md:w-2/5">
                <h3 className="text-2xl md:text-3xl font-serif mb-6 tracking-wide text-center md:text-left">{room.name}</h3>
                <blockquote className="border-l-[1px] border-[#D4AF37] pl-4 md:pl-5 mb-8 mx-auto md:mx-0 max-w-lg md:max-w-none">
                  <p className="font-quote text-lg md:text-xl italic text-black tracking-wide leading-relaxed">{room.tagline}</p>
                </blockquote>
                <p className="text-neutral-500 font-light leading-loose text-justify mb-8 text-sm md:text-base">{room.desc}</p>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-y-6 gap-x-2 mb-8 border-t border-b border-neutral-100 py-6">
                  {[ { icon: room.name.includes("Sea") ? Waves : Trees, label: room.name.includes("Sea") ? tr("Pemandangan Laut", "Sea View") : tr("Pemandangan Taman", "Garden View") }, { icon: Bath, label: tr("Kolam Pribadi", "Private Pool") }, { icon: Home, label: tr("Balkon", "Balcony") }, { icon: Coffee, label: tr("Kopi & Teh", "Coffee & Tea") }, { icon: Wifi, label: "WIFI" }, { icon: Car, label: tr("Layanan Valet", "Valet Parking") }, { icon: Store, label: tr("Toko Mini", "Mini Store") }, { icon: Sun, label: tr("Rooftop", "Rooftop") }, { icon: Utensils, label: tr("Restoran", "Restaurant") }, { icon: CreditCard, label: "ATM" } ].map((fac, i) => (
                    <div key={i} className="flex flex-col items-center justify-start text-center group">
                      <fac.icon size={20} strokeWidth={1.5} className="text-[#D4AF37] mb-2 md:mb-3 transition-transform duration-200 md:group-hover:scale-110" />
                      <span className="text-[7.5px] sm:text-[8px] font-bold tracking-widest uppercase text-neutral-500 leading-tight px-1">{fac.label}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-6 md:gap-10 text-[10px] font-bold tracking-widest uppercase text-neutral-400 mb-10 justify-center md:justify-start">
                  <div className="flex items-center gap-2"><Maximize size={14} className="text-[#D4AF37]"/> {room.size}</div>
                  <div className="flex items-center gap-2"><BedDouble size={14} className="text-[#D4AF37]"/> {room.bed}</div>
                </div>
                <button onClick={(e) => { if (typeof window !== 'undefined' && (window as any).gtag) { (window as any).gtag('event', 'room_type_select', { event_category: 'booking', event_label: room.name, room_type: room.name, room_name: room.name, click_location: 'rooms_page_reserve' }); } scrollToBooking(e); }} className="w-full md:w-auto bg-black text-[#D4AF37] px-10 min-h-[56px] md:min-h-auto md:py-4 text-[12px] md:text-[10px] font-bold tracking-widest uppercase hover:bg-neutral-800 transition-colors duration-200 touch-action-manipulation active:scale-[0.98] md:active:scale-95 focus-ring rounded-[8px] md:rounded-[1px]">{tr('Pesan Sanctuary', 'Reserve Sanctuary')}</button>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </div>
  );
}
