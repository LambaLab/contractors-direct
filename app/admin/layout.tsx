export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground">
      {children}
    </div>
  )
}
