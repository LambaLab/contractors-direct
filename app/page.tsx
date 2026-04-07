'use client'

import HeroSection from '@/components/landing/HeroSection'
import HowItWorks from '@/components/landing/HowItWorks'
import ValueProps from '@/components/landing/ValueProps'
import SocialProof from '@/components/landing/SocialProof'
import Footer from '@/components/landing/Footer'

export default function LandingPage() {
  return (
    <main>
      <HeroSection />
      <HowItWorks />
      <ValueProps />
      <SocialProof />
      <Footer />
    </main>
  )
}
