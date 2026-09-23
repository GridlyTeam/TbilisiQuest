import { searchPlayers } from '@/lib/admin-actions'
import PlayerManager from '@/components/admin/PlayerManager'

export const dynamic = 'force-dynamic'

export default async function AdminPlayersPage() {
  const players = await searchPlayers('')
  return <PlayerManager initial={players} />
}
