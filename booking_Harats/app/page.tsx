// v3: force turbopack rebuild - timestamp 1711558800
import { BookingForm } from "@/components/booking-form"
import { FileText, ArrowUpRight } from "lucide-react"

export default function BookingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Hero Section */}
      <div className="px-5 py-8">
        <div className="mb-0 text-center">
          <h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground text-balance">
            Забронировать столик
          </h1>
          <p className="text-sm text-muted-foreground">
            Выберите удобное время и дату
          </p>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 px-5">
        {/* Menu Link - stylish card */}
        <a
          href="/menu5.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="group mb-8 flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all active:scale-[0.98]"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-foreground">Меню ресторана</p>
            <p className="text-sm text-muted-foreground">Ознакомьтесь перед визитом</p>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary transition-colors group-active:bg-primary/10">
            <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-colors group-active:text-primary" />
          </div>
        </a>

        {/* Form Card */}
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <BookingForm />
        </div>
      </main>

      {/* Contact Section */}
      <div className="mt-8 px-5 pb-6">
        <div className="rounded-2xl bg-primary p-5 text-primary-foreground">
          <p className="mb-4 text-xs font-medium uppercase tracking-widest opacity-70">
            Контакты
          </p>
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <span className="text-sm opacity-70">Адрес</span>
              <span className="text-right text-sm font-medium">ул. Карла Маркса, 24</span>
            </div>
            <div className="flex items-start justify-between">
              <span className="text-sm opacity-70">Телефон</span>
              <a href="tel:+375447625546" className="text-sm font-medium underline underline-offset-2">
                +375 44 762-55-46
              </a>
            </div>
            <div className="flex items-start justify-between">
              <span className="text-sm opacity-70">Режим заведения</span>
              <span className="text-right text-sm font-medium whitespace-pre-line">
                {"пн-чт 12:00-2:00\nпт 12:00-4:00\nсб 14:00-4:00\nвс 14:00-2:00"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-5 pb-8 pt-2">
        <p className="text-center text-xs text-muted-foreground">
          © 2026 Ресторан. Все права защищены.
        </p>
      </footer>
    </div>
  )
}
