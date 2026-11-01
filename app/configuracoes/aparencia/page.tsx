import type { Metadata } from 'next'
import AppearanceSettings from '@/components/aparencia/AppearanceSettings'

export const metadata: Metadata = { title: 'Aparência' }
export default function AppearancePage() { return <AppearanceSettings /> }
