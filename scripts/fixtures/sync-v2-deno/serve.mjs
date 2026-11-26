// Keep the checked-in Edge startup, guard and handler intact. Bind only to loopback.
const serve = Deno.serve;
Deno.serve = handler => serve({
  hostname: '127.0.0.1',
  port: 0,
  onListen: ({port}) => console.log('EDGE_LOOPBACK_PORT=' + port),
}, handler);
await import('../../../supabase/functions/orbis-khata-data/index.ts');
