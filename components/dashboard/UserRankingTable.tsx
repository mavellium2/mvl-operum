import { formatReais } from '@/lib/dinheiro'
import UserAvatar from '@/components/user/UserAvatar'

interface UserMetric {
  id: string
  name: string
  cargo?: string | null
  avatarUrl?: string | null
  horasTotais: number
  custoTotal: number
}

interface UserRankingTableProps {
  users: UserMetric[]
}

export default function UserRankingTable({ users }: UserRankingTableProps) {
  const sorted = [...users].sort((a, b) => b.horasTotais - a.horasTotais)

  if (sorted.length === 0) return <p className="text-sm text-gray-400 text-center py-4">Sem dados de usuários</p>

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100">
          <th className="text-left font-medium text-gray-500 pb-2">Usuário</th>
          <th className="text-right font-medium text-gray-500 pb-2">Horas</th>
          <th className="text-right font-medium text-gray-500 pb-2">Custo</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(u => (
          <tr key={u.id} className="border-b border-gray-50 last:border-0">
            <td className="py-2.5">
              <div className="flex items-center gap-2">
                <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                <div>
                  <p className="font-medium text-gray-900">{u.name}</p>
                  {u.cargo && <p className="text-xs text-gray-400">{u.cargo}</p>}
                </div>
              </div>
            </td>
            <td className="py-2.5 text-right tabular-nums text-gray-700">{u.horasTotais.toFixed(1)}h</td>
            <td className="py-2.5 text-right tabular-nums text-green-700 font-medium">{formatReais(u.custoTotal)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
