import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/** Website language (ID default, EN optional; brand taglines + CMS content stay as written). Strings stay next to the code as pairs:
 *    const { tr } = useLang();  tr('Simpan', 'Save')
 *  ponytail: inline pairs instead of key files, so every module owns its own copy. */
export type Lang = 'id' | 'en'
const KEY = 'hone_web_lang'

type Ctx = { lang: Lang; setLang: (l: Lang) => void; tr: (id: string, en: string) => string; locale: string }
const LangCtx = createContext<Ctx>({ lang: 'id', setLang: () => {}, tr: (id) => id, locale: 'id-ID' })

function initial(): Lang {
  try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'id' } catch { return 'id' }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial)
  useEffect(() => { document.documentElement.lang = lang }, [lang])
  const setLang = (l: Lang) => { setLangState(l); try { localStorage.setItem(KEY, l) } catch { /* private mode */ } }
  const tr = (id: string, en: string) => (lang === 'en' ? en : id)
  return <LangCtx.Provider value={{ lang, setLang, tr, locale: lang === 'en' ? 'en-GB' : 'id-ID' }}>{children}</LangCtx.Provider>
}

export const useLang = () => useContext(LangCtx)

// for plain helpers outside components (formatters, error maps): pass lang in, or read the stored choice
export const currentLang = (): Lang => initial()
export const trNow = (id: string, en: string) => (initial() === 'en' ? en : id)

/** ID | EN switch (two segments, active one black/gold). */
export function LangSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang } = useLang()
  return (
    <div role="group" aria-label="Bahasa / Language" className={`inline-flex rounded-lg bg-neutral-100 p-0.5 text-[11px] font-semibold ${className}`}>
      {(['id', 'en'] as const).map((l) => (
        <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
          className={`min-h-8 min-w-9 rounded-md px-2 uppercase tracking-wide transition-colors ${lang === l ? 'bg-[#1c1c1c] text-[#D4AF37]' : 'text-neutral-500 hover:text-neutral-900'}`}>
          {l}
        </button>
      ))}
    </div>
  )
}
