import type { Metadata, Viewport } from 'next'
import { DM_Sans, Syne } from 'next/font/google'
import './globals.css'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' })
const syne = Syne({ subsets: ['latin'], variable: '--font-syne' })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: 'Contractors Direct',
  description: 'AI-powered renovation management for the UAE. Get a real quote in minutes.',
}

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
    <html lang="en" suppressHydrationWarning className={`dark ${dmSans.variable} ${syne.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ANTI_FLASH_SCRIPT }} />
      </head>
      <body className="bg-brand-dark text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}
