export interface VisitorPreferences {
  getTimeZone(visitorId: string): Promise<string | null>;
  saveTimeZone(visitorId: string, timeZone: string, seenAt: Date): Promise<void>;
}
