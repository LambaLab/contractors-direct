import type { Metadata, Viewport } from 'next'
import { DM_Sans, Syne } from 'next/font/google'
import Script from 'next/script'
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
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Contractors Direct',
    description: 'AI-powered renovation management for the UAE. Get a real quote in minutes.',
    images: [{ url: '/og-image.png', width: 1080, height: 1080 }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contractors Direct',
    description: 'AI-powered renovation management for the UAE. Get a real quote in minutes.',
    images: ['/og-image.png'],
  },
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
        <Script id="anti-flash" strategy="beforeInteractive">{ANTI_FLASH_SCRIPT}</Script>
      </head>
      <body className="bg-brand-dark text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}
