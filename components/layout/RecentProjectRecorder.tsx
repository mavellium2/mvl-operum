'use client'
import { useEffect } from 'react'
import { recentProjectKey } from '@/lib/recentProject'
export default function RecentProjectRecorder({ userId, tenantId, projectId }: { userId: string; tenantId: string; projectId: string }) {
  useEffect(() => {
    document.cookie = `${recentProjectKey(userId, tenantId)}=${encodeURIComponent(projectId)}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
  }, [userId, tenantId, projectId])
  return null
}
