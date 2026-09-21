'use client'

import { useI18n, type MessageKey } from '@/lib/i18n'

export default function RoleNotice({ messageKey }: { messageKey: MessageKey }) {
  const { t } = useI18n()
  return <p className="text-sm text-neutral-600">{t(messageKey)}</p>
}
