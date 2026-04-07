import type { Metadata, Viewport } from 'next'
import { Inter, Bebas_Neue } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter-sans' })
const bebas = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--font-bebas-neue' })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: 'Contractors Direct — Transform Your Home',
  description: 'Describe your renovation. Get a real quote in minutes.',
}

// Blocking inline script that runs BEFORE first paint.
// Checks localStorage for an active session and hides the landing page
// so the user never sees a flash of the homepage before React hydrates.
// Only applies when the overlay will actually auto-open (?c= param).
// On bare "/", the user expects to see the landing page.
const ANTI_FLASH_SCRIPT = `
(function(){
  try {
    var c = new URLSearchParams(window.location.search).get('c');
    if (c && localStorage.getItem('cd_session')) {
      document.documentElement.classList.add('has-session');
    }
  } catch(e) {}
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${bebas.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ANTI_FLASH_SCRIPT }} />
      </head>
      <body className="bg-brand-dark text-brand-white font-inter antialiased">
        {children}
      </body>
    </html>
  )
}
