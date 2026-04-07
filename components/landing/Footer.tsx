import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="py-12 px-4 border-t border-white/5">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <span className="font-heading font-bold text-2xl text-brand-white tracking-widest">CONTRACTORS DIRECT</span>
        <div className="flex items-center gap-6">
          <Link
            href="/admin"
            className="text-brand-gray-mid/40 hover:text-brand-gray-mid text-xs transition-colors"
          >
            Admin
          </Link>
          <p className="text-brand-gray-mid text-sm">
            &copy; {new Date().getFullYear()} Contractors Direct. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
