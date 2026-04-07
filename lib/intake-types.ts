export type QuickReplyOption = {
  label: string
  description?: string
  icon?: string
  value: string
}

export type QuickReplies = {
  style: 'list' | 'pills'
  multiSelect?: boolean
  allowCustom?: boolean
  options: QuickReplyOption[]
}
