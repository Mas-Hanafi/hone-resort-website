import { ScrollReveal, WordReveal } from '../components/reveal';
import { ChevronLeft, Check } from 'lucide-react';
import { useLang } from '../lang';

type PackageDetail = {
  title: string; subtitle: string; heroImg: string; description: string;
  includes: string[]; price: string;
};

export default function PackageDetailPage({ navigate, selectedPackageId, data, handleGeneralInquiry }: {
  navigate: (path: string) => void;
  selectedPackageId: string;
  data: PackageDetail;
  handleGeneralInquiry: (packageName: string, location?: string) => void;
}) {
  const { tr } = useLang();
  return (
    <div className="pt-24 md:pt-32 pb-24 animate-in fade-in duration-500 bg-white min-h-screen">
      <div className="max-w-7xl mx-auto px-6">
        <button onClick={() => { navigate('/'); setTimeout(() => document.getElementById('package')?.scrollIntoView({ behavior: 'smooth' }), 100); }} className="flex items-center text-neutral-500 hover:text-black mb-8 md:mb-10 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors duration-200 group w-fit min-h-[48px] touch-action-manipulation focus-ring">
          <ChevronLeft size={16} className="mr-2 md:group-hover:-translate-x-1 transition-transform duration-200" /> {tr('Kembali ke Pengalaman', 'Back to Experiences')}
        </button>
        <ScrollReveal variant="blur" className="w-full h-[40vh] md:h-[60vh] overflow-hidden rounded-sm shadow-xl md:shadow-2xl mb-12 md:mb-16 relative">
          <img loading="lazy" decoding="async" src={data.heroImg} width="1200" height="800" alt={data.title} className={`w-full h-full object-cover ${selectedPackageId === 'floating' ? 'object-[50%_75%] md:object-[50%_85%]' : selectedPackageId === 'cake' ? 'object-[50%_85%]' : 'object-center'}`} />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent"></div>
          <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-16">
            <p className="text-[#D4AF37] font-bold tracking-[0.4em] text-[10px] mb-3 md:mb-4 uppercase italic drop-shadow-md">{data.subtitle}</p>
            <WordReveal text={data.title} as="h1" delay={0.2} stagger={0.05} className="text-2xl md:text-5xl font-serif uppercase tracking-wide text-white drop-shadow-lg leading-tight" />
          </div>
        </ScrollReveal>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 md:gap-16">
          <ScrollReveal variant="fadeUp" className="lg:col-span-2">
            <h3 className="text-xl md:text-2xl font-serif text-black uppercase tracking-wide mb-6">{tr('Ringkasan Pengalaman', 'Experience Overview')}</h3>
            <p className="text-neutral-600 font-light leading-relaxed text-justify mb-10 md:mb-12 text-sm md:text-lg">{data.description}</p>
            <h3 className="text-lg md:text-xl font-serif text-black uppercase tracking-wide mb-6 border-t border-neutral-100 pt-8 md:pt-10">{tr('Sudah Termasuk', "What's Included")}</h3>
            <ul className="space-y-4">
              {data.includes.map((inc, i) => (
                <li key={i} className="flex items-start text-neutral-600 font-light text-sm md:text-base">
                  <Check size={18} className="text-[#D4AF37] mr-4 shrink-0 mt-0.5" />
                  <span className="leading-snug">{inc}</span>
                </li>
              ))}
            </ul>
          </ScrollReveal>
          <ScrollReveal variant="slideRight" delay={0.2} className="lg:col-span-1">
            <div className="bg-neutral-50 p-6 md:p-8 border border-neutral-100 shadow-xl lg:sticky lg:top-32 rounded-[12px] md:rounded-sm">
              <h4 className="font-serif text-lg md:text-xl text-black uppercase tracking-wide mb-4">{tr('Pesan Pengalaman Ini', 'Book This Experience')}</h4>
              <p className="text-neutral-500 font-light text-sm mb-6 md:mb-8 pb-6 md:pb-8 border-b border-neutral-200 leading-relaxed">{tr('Hubungi kami untuk mengatur jadwal dan menyesuaikan paket sesuai dengan kebutuhan Anda selama menginap.', 'Contact us to arrange the schedule and tailor the package to your needs during your stay.')}</p>
              <div className="mb-8">
                <span className="block text-[9px] font-bold tracking-[0.4em] text-neutral-400 uppercase mb-2 md:mb-3">{tr('Harga', 'Price')}</span>
                <span className="text-xl font-serif text-[#8A6D00] tracking-wide">{data.price}</span>
              </div>
              <button onClick={() => handleGeneralInquiry(data.title, 'package_detail_modal')} className="w-full bg-black text-[#D4AF37] min-h-[56px] md:min-h-auto md:py-4 text-[12px] md:text-[10px] font-bold tracking-widest uppercase hover:bg-neutral-800 transition-colors duration-200 shadow-lg touch-action-manipulation active:scale-[0.98] md:active:scale-95 rounded-[8px] md:rounded-sm focus-ring">{tr('Pesan Pengalaman', 'Reserve Experience')}</button>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </div>
  );
}
