'use client'

import { formatReais } from '@/lib/dinheiro'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface SprintCostChartProps {
  data: { name: string; custoTotal: number; horasTotais: number }[]
}

export default function SprintCostChart({ data }: SprintCostChartProps) {
  if (data.length === 0) return <p className="text-sm text-gray-400 text-center py-8">Sem dados de sprints</p>
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={(value, name) => {
            const v = Number(value)
            return name === 'custoTotal' ? [formatReais(v), 'Custo'] : [`${v.toFixed(1)}h`, 'Horas']
          }}
        />
        <Bar dataKey="custoTotal" fill="#3b82f6" radius={[4, 4, 0, 0]} name="custoTotal" />
      </BarChart>
    </ResponsiveContainer>
  )
}
