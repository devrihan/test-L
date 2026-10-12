// Build-time switches. Only for surfaces that have NO runtime config key —
// anything a school can turn on belongs in config-manager, declared in
// app/lib/config-schema.ts, and read through useFeatureFlag.
//
// Do not add a constant here that shadows a config key. SHOW_COMMON_MISTAKES
// used to, ANDed with show_common_mistakes_exam_page on the exam page, so that
// flag could never take effect: config-manager reported the change applied and
// nothing happened. That is the second-source-of-truth failure the no-fallback
// config contract exists to prevent.

// Login page's decorative "Ask questions" chatbar + volume icon — hidden for
// now. Pre-auth, so there is no school session to read config for; a build-time
// constant is the only option here.
export const SHOW_LOGIN_CHAT_WIDGET = false
