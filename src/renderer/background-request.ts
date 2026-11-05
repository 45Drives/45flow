// Mark a request the page makes by itself (progress polling) as not being user activity.
// The server still checks the session but does not extend it, so an open tab that only
// refreshes itself reaches the idle timeout. Spread into the request's headers.
export const BACKGROUND_REQUEST = { 'X-Background-Request': '1' } as const
