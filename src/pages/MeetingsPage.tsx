import { ScrollReveal, WordReveal } from '../components/reveal';
import { ChevronLeft, Check } from 'lucide-react';
import { useLang } from '../lang';

const detailedMeetingPackages = [
  {
    id: 'fullboard-platinum', title: "FULLBOARD MEETING PLATINUM", price: "Rp 950.000", unit: "/ PAX",
    includes: ["2 Persons / Room", "Room and Breakfast", "Usage of Function Room for 12 hours", "2x Coffee Breaks, 1x Lunch, 1x Dinner", "LCD Projector & Screen", "Standard Sound System with Microphones", "Standing Flipchart & Markers", "Includes H One Entrance Ticket", "Includes 1x Attraction Ticket", "Inclusive of Tax & Service Charge"]
  },
  {
    id: 'fullboard-diamond', title: "FULLBOARD MEETING DIAMOND", price: "Rp 850.000", unit: "/ PAX",
    includes: ["3 Persons / Room", "Room and Breakfast", "Usage of Function Room for 12 hours", "2x Coffee Breaks, 1x Lunch, 1x Dinner", "LCD Projector & Screen", "Standard Sound System with Microphones", "Standing Flipchart & Markers", "Includes H One Entrance Ticket", "Includes 1x Attraction Ticket", "Inclusive of Tax & Service Charge"]
  },
  {
    id: 'fullboard-gold', title: "FULLBOARD MEETING GOLD", price: "Rp 750.000", unit: "/ PAX",
    includes: ["4 Persons / Room", "Room and Breakfast", "Usage of Function Room for 12 hours", "2x Coffee Breaks, 1x Lunch, 1x Dinner", "LCD Projector & Screen", "Standard Sound System with Microphones", "Standing Flipchart & Markers", "Includes H One Entrance Ticket", "Includes 1x Attraction Ticket", "Inclusive of Tax & Service Charge"]
  },
  {
    id: 'fullday', title: "FULL DAY MEETING", price: "Rp 550.000", unit: "/ PAX",
    includes: ["Usage of Meeting Room for 8 hours", "2x Coffee Breaks (2 snack items)", "1x Buffet Lunch", "Notepads, pens, mints & mineral water", "LCD Projector (5000 Lumens) & Screen", "Includes H One Entrance Ticket", "Includes 1x Attraction Ticket", "Inclusive of Tax & Service Charge"]
  },
  {
    id: 'halfday', title: "HALF DAY MEETING", price: "Rp 350.000", unit: "/ PAX",
    includes: ["Usage of Meeting Room for 4 hours", "1x Coffee Break (2 snack items)", "1x Buffet Lunch or Dinner", "Notepads, pens, mints & mineral water", "LCD Projector (5000 Lumens) & Screen", "High-speed Wi-Fi access", "Includes 1x Attraction Ticket", "Inclusive of Tax & Service Charge"]
  }
];

// Indonesian copy of the built-in package inclusions (used only when the CMS list is empty; CMS text stays as written)
const includesId: Record<string, string[]> = {
  'fullboard-platinum': ["2 Orang / Kamar", "Kamar dan Sarapan", "Penggunaan Function Room selama 12 jam", "2x Coffee Break, 1x Makan Siang, 1x Makan Malam", "LCD Projector & Layar", "Sound System Standar dengan Mikrofon", "Flipchart Berdiri & Spidol", "Termasuk Tiket Masuk H One", "Termasuk 1x Tiket Wahana", "Sudah Termasuk Pajak & Service Charge"],
  'fullboard-diamond': ["3 Orang / Kamar", "Kamar dan Sarapan", "Penggunaan Function Room selama 12 jam", "2x Coffee Break, 1x Makan Siang, 1x Makan Malam", "LCD Projector & Layar", "Sound System Standar dengan Mikrofon", "Flipchart Berdiri & Spidol", "Termasuk Tiket Masuk H One", "Termasuk 1x Tiket Wahana", "Sudah Termasuk Pajak & Service Charge"],
  'fullboard-gold': ["4 Orang / Kamar", "Kamar dan Sarapan", "Penggunaan Function Room selama 12 jam", "2x Coffee Break, 1x Makan Siang, 1x Makan Malam", "LCD Projector & Layar", "Sound System Standar dengan Mikrofon", "Flipchart Berdiri & Spidol", "Termasuk Tiket Masuk H One", "Termasuk 1x Tiket Wahana", "Sudah Termasuk Pajak & Service Charge"],
  'fullday': ["Penggunaan Ruang Meeting selama 8 jam", "2x Coffee Break (2 macam kudapan)", "1x Makan Siang Prasmanan", "Buku catatan, pulpen, permen mint & air mineral", "LCD Projector (5000 Lumens) & Layar", "Termasuk Tiket Masuk H One", "Termasuk 1x Tiket Wahana", "Sudah Termasuk Pajak & Service Charge"],
  'halfday': ["Penggunaan Ruang Meeting selama 4 jam", "1x Coffee Break (2 macam kudapan)", "1x Makan Siang atau Makan Malam Prasmanan", "Buku catatan, pulpen, permen mint & air mineral", "LCD Projector (5000 Lumens) & Layar", "Akses Wi-Fi berkecepatan tinggi", "Termasuk 1x Tiket Wahana", "Sudah Termasuk Pajak & Service Charge"],
};

export default function MeetingsPage({ navigate, handleGeneralInquiry, packages }: {
  navigate: (path: string) => void;
  handleGeneralInquiry: (packageName: string, location?: string) => void;
  packages?: typeof detailedMeetingPackages;
}) {
  const { tr, lang } = useLang();
  const fromCms = !!packages && packages.length > 0;
  const meetingPkgs = fromCms ? packages! : detailedMeetingPackages;
  // built-in fallback copy has an Indonesian version; CMS text is shown as written
  const inc = (pkgId: string, text: string, i: number) => (!fromCms && lang === 'id' ? includesId[pkgId]?.[i] ?? text : text);
  return (
    <div className="pt-24 md:pt-32 pb-24 animate-in fade-in duration-500 bg-neutral-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-6">
        <button onClick={() => { navigate('/'); setTimeout(() => document.getElementById('meeting-package')?.scrollIntoView({ behavior: 'smooth' }), 100); }} className="flex items-center text-neutral-500 hover:text-black mb-8 md:mb-10 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors duration-200 group w-fit min-h-[48px] touch-action-manipulation focus-ring">
          <ChevronLeft size={16} className="mr-2 md:group-hover:-translate-x-1 transition-transform duration-200" /> {tr('Kembali ke Beranda', 'Back to Home')}
        </button>
        <ScrollReveal variant="blur" className="w-full h-[50vh] md:h-[60vh] overflow-hidden rounded-sm shadow-xl md:shadow-2xl mb-16 md:mb-20 relative flex items-center justify-center text-center">
          <video autoPlay loop muted playsInline preload="none" className="absolute inset-0 w-full h-full object-cover">
            <source src="https://res.cloudinary.com/YOUR_CLOUD_NAME/video/fetch/q_auto/https://i.imgur.com/uYxomrP.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-black/60"></div>
          <div className="relative z-10 flex flex-col items-center justify-center p-6 md:p-12 w-full max-w-3xl">
            <p className="text-[#D4AF37] font-bold tracking-[0.4em] text-[10px] mb-4 md:mb-6 uppercase italic drop-shadow-md">{tr('Pertemuan Eksekutif', 'Executive Gatherings')}</p>
            <WordReveal text="Sky & Sea View Meetings" as="h1" delay={0.2} stagger={0.08} className="text-3xl md:text-5xl font-serif uppercase tracking-wide text-white drop-shadow-lg leading-tight justify-center" />
            <p className="text-neutral-200 mt-6 md:mt-8 font-light leading-relaxed text-sm md:text-base drop-shadow-md">
              {tr('Dirancang khusus untuk mendukung fokus, privasi, dan dialog yang terarah — dengan standar hospitality luxury yang tidak pernah menginterupsi jalannya pertemuan Anda.', 'Designed to support focus, privacy and purposeful dialogue, with a standard of luxury hospitality that never interrupts your proceedings.')}
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
          {meetingPkgs.map((pkg, idx) => {
            const isPlatinum = idx === 0;
            const cardContent = (
              <>
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#D4AF37]/50 to-transparent scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left"></div>
                <h3 className="text-xl md:text-2xl font-serif text-black uppercase tracking-wide mb-2">{pkg.title}</h3>
                <div className="flex items-baseline gap-1 mb-8">
                  <span className="text-2xl font-serif text-[#8A6D00] tracking-wide">{pkg.price}</span>
                  <span className="text-[10px] font-bold tracking-widest text-neutral-400 uppercase">{pkg.unit}</span>
                </div>
                <div className="flex-grow">
                  <ul className="space-y-4 mb-10">
                    {pkg.includes.map((incText, i) => (
                      <li key={i} className="flex items-start text-neutral-600 font-light text-sm">
                        <Check size={16} className="text-[#D4AF37] mr-3 shrink-0 mt-0.5" />
                        <span className="leading-snug">{inc(pkg.id, incText, i)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {isPlatinum ? (
                  <div className="relative mt-auto w-full overflow-hidden rounded-sm">
                    <div className="platinum-btn-ring" aria-hidden="true" />
                    <button onClick={() => handleGeneralInquiry(pkg.title, 'package_card')} className="relative z-10 w-full bg-neutral-900 text-[#D4AF37] min-h-[56px] md:min-h-auto md:py-4 text-[12px] md:text-[10px] font-bold tracking-widest uppercase hover:bg-black transition-colors duration-200 shadow-md touch-action-manipulation active:scale-[0.98] rounded-sm focus-ring">
                      {tr('Hubungi Kami', 'Inquire Now')}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => handleGeneralInquiry(pkg.title, 'package_card')} className="w-full bg-neutral-900 text-[#D4AF37] min-h-[56px] md:min-h-auto md:py-4 text-[12px] md:text-[10px] font-bold tracking-widest uppercase hover:bg-black transition-colors duration-200 shadow-md touch-action-manipulation active:scale-[0.98] rounded-sm focus-ring mt-auto">
                    {tr('Hubungi Kami', 'Inquire Now')}
                  </button>
                )}
              </>
            );
            if (isPlatinum) {
              return (
                <ScrollReveal key={pkg.id} variant="fadeUp" delay={0} className="bg-white p-8 md:p-10 rounded-sm shadow-sm hover:shadow-2xl transition-shadow duration-500 flex flex-col h-full relative group overflow-hidden">
                  <div className="platinum-border-ring" aria-hidden="true" />
                  <div className="relative z-10 flex flex-col h-full">
                    {cardContent}
                  </div>
                </ScrollReveal>
              );
            }
            return (
              <ScrollReveal key={pkg.id} variant="fadeUp" delay={idx * 0.15} className="bg-white border border-neutral-200 p-8 md:p-10 rounded-sm shadow-sm hover:shadow-2xl transition-shadow duration-500 flex flex-col h-full relative group">
                {cardContent}
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </div>
  );
}
