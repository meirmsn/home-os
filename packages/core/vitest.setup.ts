// What: Vitest setup — stub global WebSocket so createClient() doesn't crash in Node.
// Why: @supabase/supabase-js >= 2.105 constructs RealtimeClient eagerly inside
//      `new SupabaseClient(...)`, and RealtimeClient calls
//      `getWebSocketConstructor()` at construction. Node has no WebSocket
//      global; jsdom does but pulls in a heavy DOM we don't otherwise need.
//      A trivial class satisfies the constructor lookup; tests never actually
//      open a connection (the suite header notes "never issues a network
//      request"), so the stub's methods can be no-ops.
// Does NOT: Provide a real WebSocket implementation. Integration tests that
//           need a working Realtime client should run in jsdom or against a
//           live Supabase stack — neither happens in the unit suite.

if (typeof (globalThis as Record<string, unknown>).WebSocket === 'undefined') {
  class WebSocketStub {
    addEventListener() {}
    removeEventListener() {}
    send() {}
    close() {}
  }
  (globalThis as Record<string, unknown>).WebSocket = WebSocketStub;
}
