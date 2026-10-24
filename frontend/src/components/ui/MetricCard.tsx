import type { ReactNode } from 'react'

interface MetricCardProps {
  label: string
  value: string | number
  icon: ReactNode
  hint?: string
}

export default function MetricCard({ label, value, icon, hint }: MetricCardProps) {
  return (
    <section className="ui-surface ui-stat-card">
      <div className="ui-stat-card__icon" aria-hidden="true">
        {icon}
      </div>
      <div className="ui-stat-card__copy">
        <span className="ui-stat-card__label">{label}</span>
        <span className="ui-stat-card__value">{value}</span>
        {hint ? <span className="ui-stat-card__hint">{hint}</span> : null}
      </div>
    </section>
  )
}
