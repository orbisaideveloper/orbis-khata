export async function fixtureFeedCodec(knownKey) {
  const key=knownKey??await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  const aad=context=>Buffer.from(context);
  return {
    async seal(text,context){
      const iv=crypto.getRandomValues(new Uint8Array(12));
      const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(context)},key,Buffer.from(text));
      return Buffer.concat([iv,Buffer.from(data)]).toString('base64');
    },
    async open(sealed,context){
      const bytes=Buffer.from(sealed,'base64');
      const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,12),additionalData:aad(context)},key,bytes.subarray(12));
      return Buffer.from(data).toString('utf8');
    },
  };
}

export function sqliteFixturePort(sqlite) {
  return {
    run: async (sql, values = []) => ({ changes: Number(sqlite.prepare(sql).run(...values).changes) }),
    get: async (sql, values = []) => sqlite.prepare(sql).get(...values),
    all: async (sql, values = []) => sqlite.prepare(sql).all(...values),
    async transaction(action) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = await action();
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
