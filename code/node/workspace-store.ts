import Database from 'better-sqlite3'
import type { ID, Slab, Workspace } from '@/base/types'

export class WorkspaceStore {
  private database: Database.Database

  constructor(filePath: string) {
    this.database = new Database(filePath)
    this.migrate()
  }

  private migrate(): void {
    this.database.exec(`
      create table if not exists workspace (
        id text primary key,
        name text not null,
        root text not null,
        data text not null,
        created_at integer not null,
        updated_at integer not null
      );

      create table if not exists slab (
        id text primary key,
        workspace_id text not null,
        tab_id text not null,
        name text not null,
        cwd text not null,
        shell text not null,
        args text not null,
        command text,
        env text,
        cols integer not null,
        rows integer not null,
        status text not null,
        created_at integer not null,
        updated_at integer not null
      );

      create index if not exists slab_workspace_idx on slab (workspace_id);
      create index if not exists slab_tab_idx on slab (tab_id);
    `)
  }

  saveWorkspace(workspace: Workspace): void {
    this.database
      .prepare(
        `
        insert into workspace (
          id, name, root, data, created_at, updated_at
        ) values (
          @id, @name, @root, @data, @createdAt, @updatedAt
        )
        on conflict(id) do update set
          name = excluded.name,
          root = excluded.root,
          data = excluded.data,
          updated_at = excluded.updated_at
      `,
      )
      .run({
        id: workspace.id,
        name: workspace.name,
        root: workspace.root,
        data: JSON.stringify(workspace),
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      })
  }

  listWorkspaces(): Workspace[] {
    const rows = this.database
      .prepare(`select data from workspace order by updated_at desc`)
      .all() as Array<{ data: string }>
    return rows.map(row => JSON.parse(row.data) as Workspace)
  }

  getWorkspace(id: ID): Workspace | null {
    const row = this.database
      .prepare(`select data from workspace where id = ?`)
      .get(id) as { data: string } | undefined
    return row ? (JSON.parse(row.data) as Workspace) : null
  }

  deleteWorkspace(id: ID): void {
    this.database.prepare(`delete from workspace where id = ?`).run(id)
    this.database.prepare(`delete from slab where workspace_id = ?`).run(id)
  }

  saveSlab(slab: Slab): void {
    this.database
      .prepare(
        `
        insert into slab (
          id, workspace_id, tab_id, name, cwd, shell, args, command, env,
          cols, rows, status, created_at, updated_at
        ) values (
          @id, @workspaceId, @tabId, @name, @cwd, @shell, @args, @command,
          @env, @cols, @rows, @status, @createdAt, @updatedAt
        )
        on conflict(id) do update set
          name = excluded.name,
          cwd = excluded.cwd,
          shell = excluded.shell,
          args = excluded.args,
          command = excluded.command,
          env = excluded.env,
          cols = excluded.cols,
          rows = excluded.rows,
          status = excluded.status,
          updated_at = excluded.updated_at
      `,
      )
      .run({
        ...slab,
        command: slab.command ?? null,
        args: JSON.stringify(slab.args),
        env: JSON.stringify(slab.env ?? {}),
      })
  }

  listSlabsForWorkspace(workspaceId: ID): Slab[] {
    const rows = this.database
      .prepare(`select * from slab where workspace_id = ?`)
      .all(workspaceId) as Array<{
      id: string
      workspace_id: string
      tab_id: string
      name: string
      cwd: string
      shell: string
      args: string
      command: string | null
      env: string
      cols: number
      rows: number
      status: string
      created_at: number
      updated_at: number
    }>

    return rows.map(row => ({
      id: row.id,
      workspaceId: row.workspace_id,
      tabId: row.tab_id,
      name: row.name,
      cwd: row.cwd,
      shell: row.shell,
      args: JSON.parse(row.args) as string[],
      command: row.command ?? undefined,
      env: JSON.parse(row.env) as Record<string, string>,
      cols: row.cols,
      rows: row.rows,
      status: row.status as Slab['status'],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  close(): void {
    this.database.close()
  }
}
