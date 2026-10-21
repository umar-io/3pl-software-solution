import { ChevronRight, CircleCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardHeader } from '../ui/Card'
import { EmptyState } from '../ui/States'
import { Difference, SeverityBadge } from './Badges'
import { VarianceCard } from './VarianceCard'
import { formatQty } from '../../lib/inventoryFormat'
import type { Variance } from '../../types/inventory'

export function TopMismatches({ items, total }: { items: Variance[]; total: number }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Top mismatches"
        subtitle="Largest open discrepancies between Odoo and the shelf"
        action={
          <Link
            to="/exceptions"
            className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            View all {total} <ChevronRight size={15} />
          </Link>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          icon={<CircleCheck size={20} className="text-emerald-600" />}
          title="No open mismatches"
          body="Every counted line matches what Odoo expects."
        />
      ) : (
        <>
        <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 md:hidden">
          {items.map((v) => (
            <li key={v.id}>
              <Link to={`/exceptions?q=${encodeURIComponent(v.sku)}`} className="block active:bg-slate-50">
                <VarianceCard variance={v} />
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5 font-medium">SKU</th>
                <th className="px-3 py-2.5 font-medium">Client · Location</th>
                <th className="px-3 py-2.5 text-right font-medium">Expected</th>
                <th className="px-3 py-2.5 text-right font-medium">Actual</th>
                <th className="px-3 py-2.5 text-right font-medium">Diff</th>
                <th className="px-5 py-2.5 font-medium">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((v) => (
                <tr key={v.id} className="group transition hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link
                      to={`/exceptions?q=${encodeURIComponent(v.sku)}`}
                      className="font-medium text-slate-900 group-hover:text-brand-700"
                    >
                      {v.sku}
                    </Link>
                    <div className="max-w-[220px] truncate text-xs text-slate-500">{v.product}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-slate-800">{v.client}</div>
                    <div className="text-xs text-slate-500">{v.location}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                    {formatQty(v.expected)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-900">
                    {formatQty(v.actual)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Difference value={v.difference} />
                  </td>
                  <td className="px-5 py-3">
                    <SeverityBadge severity={v.severity} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </Card>
  )
}
