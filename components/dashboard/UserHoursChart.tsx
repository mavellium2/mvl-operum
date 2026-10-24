'use client'

import { formatReais } from '@/lib/dinheiro'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface UserHoursChartProps {
  data: { name: string; horasTotais: number; custoTotal: number }[]
}

export default function UserHoursChart({ data }: UserHoursChartProps) {
  if (data.length === 0) return <p className="text-sm text-gray-400 text-center py-8">Sem dados de horas</p>
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={(value, name) => {
            const v = Number(value)
            return name === 'horasTotais' ? [`${v.toFixed(1)}h`, 'Horas'] : [formatReais(v), 'Custo']
          }}
        />
        <Bar dataKey="horasTotais" fill="#10b981" radius={[4, 4, 0, 0]} name="horasTotais" />
      </BarChart>
    </ResponsiveContainer>
  )
}
