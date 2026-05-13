// What: Vitest setup — stub global WebSocket so @supabase/ssr →
//       @supabase/supabase-js → realtime-js (eager construction) doesn't
//       crash in the default Node test env. Mirror of
//       packages/core/vitest.setup.ts; refactor to a shared package when
//       a third copy is needed.
// Why:  @supabase/realtime-js >= 2.105 calls `getWebSocketConstructor()`
//       inside `new RealtimeClient(...)`. Node has no `WebSocket` global.
// Does NOT: Provide a real WebSocket implementation. Integration tests that
//           need a working Realtime client should run against a live local
//           Supabase stack (E2E in apps/web/e2e/).

if (typeof (globalThis as Record<string, unknown>).WebSocket === 'undefined') {
  class WebSocketStub {
    addEventListener() {}
    removeEventListener() {}
    send() {}
    close() {}
  }
  (globalThis as Record<string, unknown>).WebSocket = WebSocketStub;
}
