import { ThemeProvider } from '@/components/theme-provider'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground">
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
        {children}
      </ThemeProvider>
    </div>
  )
}
