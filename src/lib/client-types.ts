// أنواع خاصة بواجهة العميل (مثل الإعدادات)
export interface Settings {
  businessName: string
  businessInfo: string
  workingHours: string
  autoReplyEnabled: string
  aiPersona: string
  aiInstructions: string
  [key: string]: string
}
