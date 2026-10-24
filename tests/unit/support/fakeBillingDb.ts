/**
 * An in-memory Supabase double for the billing endpoints' unit tests.
 *
 * It implements the chain shapes those endpoints use: select / eq / neq / in / is / not /
 * limit, maybeSingle, insert / upsert / update / delete, rpc, and a plain `await` on any of them,
 * as supabase-js allows. Reads run against `tables`; writes change `tables` as the real
 * database would, and are also recorded in `writes`, so a test can assert on what the
 * code wrote and not only on what it returned.
 *
 * `checkout_sessions` keeps one row per user (its primary key), so a second insert for the
 * same user is refused with 23505, as Postgres refuses it. `stripe_events` is the webhook's
 * claim ledger: an insert for an id already present is a duplicate.
 *
 * Nothing here reaches the network.
 */

export type Row = Record<string, unknown>;

export interface DbError {
  code?: string;
  message: string;
}

export interface Write {
  table: string;
  op: 'insert' | 'upsert' | 'update' | 'delete';
  values: Row;
  /** The equality filters a write was matched on (update and delete). */
  eqs: Array<[string, unknown]>;
}

export interface FakeDb {
  tables: Record<string, Row[]>;
  writes: Write[];
  /** Tables whose reads fail with the given error. */
  readErrors: Map<string, DbError>;
  /** Tables whose writes fail with the given error. */
  writeErrors: Map<string, DbError>;
  /** Every table read, in order. */
  touched: string[];
  /** Results for rpc(name). An unlisted function returns 'free'. */
  rpcResults: Record<string, unknown>;
  rpcCalls: Array<{ name: string; args: Row }>;
  /** Users returned by auth.admin.getUserById, by id. */
  users: Record<string, { email: string }>;
  from(table: string): Query;
  rpc(name: string, args: Row): Promise<{ data: unknown; error: DbError | null }>;
  auth: {
    admin: {
      getUserById: (id: string) => Promise<{ data: { user: { email: string } | null } }>;
    };
  };
}

type Result = { data: unknown; error: DbError | null };

const isNull = (v: unknown) => v === null || v === undefined;

class Query implements PromiseLike<Result> {
  private filters: Array<(row: Row) => boolean> = [];
  private eqs: Array<[string, unknown]> = [];
  private max: number | null = null;
  private mode: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private values: Row = {};
  private returning = false;

  constructor(
    private readonly db: FakeDb,
    private readonly table: string
  ) {}

  select(_columns?: string) {
    // After an insert or update, select() asks for the affected rows back.
    if (this.mode !== 'select') this.returning = true;
    return this;
  }

  eq(column: string, value: unknown) {
    this.eqs.push([column, value]);
    this.filters.push((row) => row[column] === value);
    return this;
  }

  neq(column: string, value: unknown) {
    // SQL: NULL <> x is not true, so a null column never matches.
    this.filters.push((row) => !isNull(row[column]) && row[column] !== value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  is(column: string, value: null) {
    this.filters.push((row) => (isNull(row[column]) ? null : row[column]) === value);
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    if (operator === 'is' && value === null) {
      this.filters.push((row) => !isNull(row[column]));
    }
    return this;
  }

  limit(n: number) {
    this.max = n;
    return this;
  }

  insert(values: Row) {
    this.mode = 'insert';
    this.values = values;
    return this;
  }

  upsert(values: Row) {
    this.mode = 'upsert';
    this.values = values;
    return this;
  }

  update(values: Row) {
    this.mode = 'update';
    this.values = values;
    return this;
  }

  delete() {
    this.mode = 'delete';
    return this;
  }

  maybeSingle(): Promise<Result> {
    return this.run().then((r) => ({
      data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data,
      error: r.error,
    }));
  }

  /** One row, and an error when there is not exactly one (as PostgREST answers). */
  single(): Promise<Result> {
    return this.run().then((r) => {
      if (r.error) return { data: null, error: r.error };
      const rows = Array.isArray(r.data) ? r.data : [r.data];
      if (rows.length !== 1 || rows[0] === null) {
        return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      }
      return { data: rows[0], error: null };
    });
  }

  then<T1 = Result, T2 = never>(
    onFulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onRejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
  ): Promise<T1 | T2> {
    return this.run().then(onFulfilled, onRejected);
  }

  private async run(): Promise<Result> {
    const db = this.db;
    const list = (db.tables[this.table] ??= []);

    if (this.mode === 'select') {
      db.touched.push(this.table);
      const failure = db.readErrors.get(this.table);
      if (failure) return { data: null, error: failure };
      let rows = list.filter((row) => this.filters.every((f) => f(row)));
      if (this.max !== null) rows = rows.slice(0, this.max);
      return { data: rows.map((row) => ({ ...row })), error: null };
    }

    const failure = db.writeErrors.get(this.table);
    if (failure) return { data: null, error: failure };

    if (this.mode === 'insert') {
      if (
        this.table === 'checkout_sessions' &&
        list.some((r) => r.user_id === this.values.user_id)
      ) {
        return { data: null, error: { code: '23505', message: 'duplicate key' } };
      }
      if (this.table === 'stripe_events' && list.some((r) => r.id === this.values.id)) {
        return { data: null, error: { code: '23505', message: 'duplicate key' } };
      }
      list.push({ ...this.values });
      db.writes.push({ table: this.table, op: 'insert', values: this.values, eqs: [] });
      return { data: null, error: null };
    }

    if (this.mode === 'upsert') {
      const at = list.findIndex((r) => r.id === this.values.id);
      if (at >= 0) list[at] = { ...list[at], ...this.values };
      else list.push({ ...this.values });
      db.writes.push({ table: this.table, op: 'upsert', values: this.values, eqs: [] });
      return { data: null, error: null };
    }

    if (this.mode === 'delete') {
      db.tables[this.table] = list.filter((row) => !this.filters.every((f) => f(row)));
      db.writes.push({ table: this.table, op: 'delete', values: {}, eqs: this.eqs });
      return { data: null, error: null };
    }

    // update
    const hit = list.filter((row) => this.filters.every((f) => f(row)));
    for (const row of hit) Object.assign(row, this.values);
    db.writes.push({ table: this.table, op: 'update', values: this.values, eqs: this.eqs });
    return {
      data: this.returning ? hit.map((row) => ({ ...row })) : null,
      error: null,
    };
  }
}

/** A fresh database holding `tables`. */
export function makeFakeDb(tables: Record<string, Row[]> = {}): FakeDb {
  const db: FakeDb = {
    tables,
    writes: [],
    readErrors: new Map(),
    writeErrors: new Map(),
    touched: [],
    rpcResults: {},
    rpcCalls: [],
    users: {},
    from(table: string) {
      return new Query(db, table);
    },
    async rpc(name: string, args: Row) {
      db.rpcCalls.push({ name, args });
      const data = name in db.rpcResults ? db.rpcResults[name] : 'free';
      return { data, error: null };
    },
    auth: {
      admin: {
        async getUserById(id: string) {
          const user = db.users[id];
          return { data: { user: user ?? null } };
        },
      },
    },
  };
  return db;
}
