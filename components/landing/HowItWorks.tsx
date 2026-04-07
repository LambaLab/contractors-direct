const STEPS = [
  {
    number: '01',
    title: 'Describe Your Project',
    description: 'Tell our AI about your renovation. Be as detailed or vague as you want — it\'ll ask the right questions.',
  },
  {
    number: '02',
    title: 'See It Come Together',
    description: 'Watch as scope items are detected in real-time. Toggle what you need. Get a live cost estimate.',
  },
  {
    number: '03',
    title: 'Receive Your Quote',
    description: 'Get a full scope breakdown, material recommendations, and project timeline reviewed by our team.',
  },
]

export default function HowItWorks() {
  return (
    <section className="py-24 px-4 border-t border-white/5">
      <div className="max-w-5xl mx-auto">
        <h2 className="font-bebas text-5xl md:text-6xl text-center text-brand-white mb-16">
          HOW IT WORKS
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          {STEPS.map((step) => (
            <div key={step.number} className="space-y-4">
              <span className="font-bebas text-7xl text-brand-yellow/20">{step.number}</span>
              <h3 className="text-xl font-bold text-brand-white">{step.title}</h3>
              <p className="text-brand-gray-mid leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
