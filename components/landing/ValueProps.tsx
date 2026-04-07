import { Zap, Shield, BarChart3 } from 'lucide-react'

const PROPS = [
  {
    icon: Zap,
    title: 'Real Estimates, Not Guesses',
    description: 'Every number is backed by our actual project history — not a random range.',
  },
  {
    icon: Shield,
    title: 'Expert-Reviewed Quotes',
    description: 'Our team reviews every AI-generated quote before you see it.',
  },
  {
    icon: BarChart3,
    title: 'Full Project Blueprint',
    description: 'You get a real scope breakdown, material spec, and project timeline — not a pitch deck.',
  },
]

export default function ValueProps() {
  return (
    <section className="py-24 px-4 border-t border-white/5">
      <div className="max-w-5xl mx-auto">
        <h2 className="font-bebas text-5xl md:text-6xl text-center text-brand-white mb-16">
          WHY CONTRACTORS DIRECT
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          {PROPS.map(({ icon: Icon, title, description }) => (
            <div key={title} className="space-y-4 p-6 rounded-2xl border border-white/5 hover:border-brand-yellow/20 transition-colors">
              <div className="w-12 h-12 bg-brand-yellow/10 rounded-xl flex items-center justify-center">
                <Icon className="w-6 h-6 text-brand-yellow" />
              </div>
              <h3 className="text-lg font-bold text-brand-white">{title}</h3>
              <p className="text-brand-gray-mid leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
